import { describe, it, expect } from 'vitest'
import { normalize, buildScope } from './normalize'

describe('normalize — resource count = 0 disables the resource', () => {
  const raw = `resource "aws_s3_bucket" "a" {
  bucket = "a"
  count  = 0
}

resource "aws_s3_bucket" "b" {
  bucket = "b"
}`

  it('skips a resource with count = 0 (literal) silently', () => {
    const parsed = {
      resource: {
        aws_s3_bucket: {
          a: [{ bucket: 'a', count: 0 }],
          b: [{ bucket: 'b' }],
        },
      },
    }
    const res = normalize(parsed, 'main.tf', raw)
    expect(res.map((r) => r.name)).toEqual(['b'])
  })

  it('skips a resource with count = var.disabled when the var resolves to 0', () => {
    const parsed = {
      variable: { disabled: [{ default: 0 }] },
      resource: {
        aws_s3_bucket: {
          a: [{ bucket: 'a', count: '${var.disabled}' }],
          b: [{ bucket: 'b' }],
        },
      },
    }
    const scope = buildScope([parsed])
    const res = normalize(parsed, 'main.tf', raw, scope)
    expect(res.map((r) => r.name)).toEqual(['b'])
  })

  it('follows a resource once when count = var.unknown (unresolvable) — honest', () => {
    // No default → count unresolvable → cannot prove 0 → keep the resource.
    const parsed = {
      variable: { flag: [{}] },
      resource: {
        aws_s3_bucket: {
          a: [{ bucket: 'a', count: '${var.flag}' }],
        },
      },
    }
    const scope = buildScope([parsed])
    const res = normalize(parsed, 'main.tf', raw, scope)
    expect(res.map((r) => r.name)).toEqual(['a'])
  })

  it('keeps a resource with count = 1 (active)', () => {
    const parsed = {
      resource: {
        aws_s3_bucket: { a: [{ bucket: 'a', count: 1 }] },
      },
    }
    const res = normalize(parsed, 'main.tf', raw)
    expect(res.map((r) => r.name)).toEqual(['a'])
  })

  it('does not leak count/for_each/depends_on/provider as pseudo-attributes', () => {
    const parsed = {
      resource: {
        aws_s3_bucket: {
          a: [{ bucket: 'a', count: 1, depends_on: ['x'], provider: 'aws' }],
        },
      },
    }
    const res = normalize(parsed, 'main.tf', raw)
    const a = res.find((r) => r.name === 'a')
    expect(a?.attributes.count).toBeUndefined()
    expect(a?.attributes.depends_on).toBeUndefined()
    expect(a?.attributes.provider).toBeUndefined()
    expect(a?.attributes.bucket).toEqual({ kind: 'literal', value: 'a' })
  })
})

describe('normalize — resource for_each resolving to empty disables the resource', () => {
  const raw = `resource "aws_s3_bucket" "a" {
  bucket = "a"
  for_each = toset([])
}`

  it('skips a resource with for_each = [] (literal empty list)', () => {
    const parsed = {
      resource: {
        aws_s3_bucket: {
          a: [{ bucket: 'a', for_each: [] }],
          b: [{ bucket: 'b' }],
        },
      },
    }
    const res = normalize(parsed, 'main.tf', raw)
    expect(res.map((r) => r.name)).toEqual(['b'])
  })

  it('skips a resource with for_each = {} (literal empty map)', () => {
    const parsed = {
      resource: {
        aws_s3_bucket: {
          a: [{ bucket: 'a', for_each: {} }],
        },
      },
    }
    const res = normalize(parsed, 'main.tf', raw)
    expect(res.map((r) => r.name)).toEqual([])
  })

  it('skips a resource with for_each = var.envs when the var resolves to an empty list', () => {
    const parsed = {
      variable: { envs: [{ default: [] }] },
      resource: {
        aws_s3_bucket: {
          a: [{ bucket: 'a', for_each: '${var.envs}' }],
          b: [{ bucket: 'b' }],
        },
      },
    }
    const scope = buildScope([parsed])
    const res = normalize(parsed, 'main.tf', raw, scope)
    expect(res.map((r) => r.name)).toEqual(['b'])
  })

  it('follows a resource once when for_each = var.unset (unresolvable) — honest', () => {
    // No default → for_each unresolvable → cannot prove empty → keep the resource.
    const parsed = {
      variable: { envs: [{}] },
      resource: {
        aws_s3_bucket: {
          a: [{ bucket: 'a', for_each: '${var.envs}' }],
        },
      },
    }
    const scope = buildScope([parsed])
    const res = normalize(parsed, 'main.tf', raw, scope)
    expect(res.map((r) => r.name)).toEqual(['a'])
  })

  it('keeps a resource with a non-empty for_each (expanded per element)', () => {
    const parsed = {
      resource: {
        aws_s3_bucket: {
          a: [{ bucket: 'a', for_each: ['dev', 'prd'] }],
        },
      },
    }
    const res = normalize(parsed, 'main.tf', raw)
    // One instance per element, each carrying its instanceKey.
    expect(res.map((r) => r.name)).toEqual(['a', 'a'])
    expect(res.map((r) => r.instanceKey)).toEqual(['dev', 'prd'])
  })
})

describe('normalize — resource for_each per-element expansion', () => {
  const raw = `resource "aws_s3_bucket" "a" {
  for_each = toset(["dev", "prd"])
  bucket   = each.value
}`

  it('expands a literal list for_each into one instance per element', () => {
    const parsed = {
      resource: {
        aws_s3_bucket: {
          a: [{ for_each: ['dev', 'prd'], bucket: '${each.value}' }],
        },
      },
    }
    const res = normalize(parsed, 'main.tf', raw)
    expect(res).toHaveLength(2)
    expect(res.map((r) => r.instanceKey).sort()).toEqual(['dev', 'prd'])
    // each.value resolves to the element per instance.
    const dev = res.find((r) => r.instanceKey === 'dev')
    expect(dev?.attributes.bucket).toEqual({ kind: 'literal', value: 'dev' })
    const prd = res.find((r) => r.instanceKey === 'prd')
    expect(prd?.attributes.bucket).toEqual({ kind: 'literal', value: 'prd' })
  })

  it('expands a literal map for_each (key becomes instanceKey, each.value the value)', () => {
    const parsed = {
      resource: {
        aws_s3_bucket: {
          a: [
            {
              for_each: { dev: { enc: true }, prd: { enc: true } },
              bucket: '${each.key}',
            },
          ],
        },
      },
    }
    const res = normalize(parsed, 'main.tf', raw)
    expect(res.map((r) => r.instanceKey).sort()).toEqual(['dev', 'prd'])
    // each.key resolves to the map key per instance.
    const dev = res.find((r) => r.instanceKey === 'dev')
    expect(dev?.attributes.bucket).toEqual({ kind: 'literal', value: 'dev' })
  })

  it('resolves a var-typed for_each to its default collection and expands', () => {
    const parsed = {
      variable: { envs: [{ default: ['dev', 'prd'] }] },
      resource: {
        aws_s3_bucket: {
          a: [{ for_each: '${var.envs}', bucket: '${each.value}' }],
        },
      },
    }
    const scope = buildScope([parsed])
    const res = normalize(parsed, 'main.tf', raw, scope)
    expect(res).toHaveLength(2)
    expect(res.map((r) => r.instanceKey).sort()).toEqual(['dev', 'prd'])
  })

  it('follows an UNRESOLVABLE for_each once with no each.* bindings (honest)', () => {
    // No default → for_each unresolvable → one instance, no instanceKey,
    // each.value stays unresolved (could-not-evaluate, not a false verdict).
    const parsed = {
      variable: { envs: [{}] },
      resource: {
        aws_s3_bucket: {
          a: [{ for_each: '${var.envs}', bucket: '${each.value}' }],
        },
      },
    }
    const scope = buildScope([parsed])
    const res = normalize(parsed, 'main.tf', raw, scope)
    expect(res).toHaveLength(1)
    expect(res[0]?.instanceKey).toBeUndefined()
    expect(res[0]?.attributes.bucket).toEqual({
      kind: 'unresolved',
      expr: '${each.value}',
    })
  })

  it('does not leak for_each/count as attributes on expanded instances', () => {
    const parsed = {
      resource: {
        aws_s3_bucket: {
          a: [{ for_each: ['dev'], bucket: 'b', count: 1 }],
        },
      },
    }
    const res = normalize(parsed, 'main.tf', raw)
    const a = res[0]!
    expect(a.attributes.for_each).toBeUndefined()
    expect(a.attributes.count).toBeUndefined()
    expect(a.attributes.bucket).toEqual({ kind: 'literal', value: 'b' })
  })
})
