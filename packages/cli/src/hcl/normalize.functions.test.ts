import { describe, it, expect } from 'vitest'
import {
  normalize,
  buildScope,
  resolveListExpr,
  resolveMergeMap,
} from './normalize'
import type { Scope } from './normalize'

const raw = `resource "aws_s3_bucket" "a" {
  bucket = "a"
}`

/** Build a scope from var/local entries (mirror buildScope's input shape). */
const scopeOf = (vars: Record<string, unknown>): Scope => {
  const variable: Record<string, unknown[]> = {}
  for (const [k, v] of Object.entries(vars)) variable[k] = [{ default: v }]
  return buildScope([{ variable }])
}

describe('normalize — resolveListExpr (direct)', () => {
  it('resolves a literal array passed through (hcl2json direct shape)', () => {
    expect(resolveListExpr(['dev', 'prd'], new Map())).toEqual(['dev', 'prd'])
  })

  it('returns undefined for a non-list raw value', () => {
    expect(resolveListExpr('not-a-list', new Map())).toBeUndefined()
    expect(resolveListExpr(42, new Map())).toBeUndefined()
    expect(resolveListExpr(undefined, new Map())).toBeUndefined()
  })

  it('resolves a sole var ref to its list default', () => {
    const scope = scopeOf({ envs: ['dev', 'prd'] })
    expect(resolveListExpr('${var.envs}', scope)).toEqual(['dev', 'prd'])
  })

  it('returns undefined for a sole var ref to a scalar (not a list)', () => {
    const scope = scopeOf({ name: 'x' })
    expect(resolveListExpr('${var.name}', scope)).toBeUndefined()
  })

  it('returns undefined for an unresolvable sole ref', () => {
    expect(resolveListExpr('${var.missing}', new Map())).toBeUndefined()
  })
})

describe('normalize — toset() / tolist() resolution', () => {
  it('resolves toset(["dev","prd"]) to the literal list', () => {
    expect(resolveListExpr('${toset(["dev", "prd"])}', new Map())).toEqual([
      'dev',
      'prd',
    ])
  })

  it('resolves toset([]) to an empty list', () => {
    expect(resolveListExpr('${toset([])}', new Map())).toEqual([])
  })

  it('resolves tolist(...) identically to toset (identity-on-list)', () => {
    expect(resolveListExpr('${tolist(["a", "b"])}', new Map())).toEqual([
      'a',
      'b',
    ])
  })

  it('resolves toset(var.envs) when the var default is a list', () => {
    const scope = scopeOf({ envs: ['dev', 'prd'] })
    expect(resolveListExpr('${toset(var.envs)}', scope)).toEqual(['dev', 'prd'])
  })

  it('returns undefined for toset(var.unset) — unresolvable ref (honest)', () => {
    // No default → cannot prove the set → degrade, never a guess.
    const scope = buildScope([{ variable: { unset: [{}] } }])
    expect(resolveListExpr('${toset(var.unset)}', scope)).toBeUndefined()
  })

  it('returns undefined for an unknown function (honest degrade)', () => {
    expect(resolveListExpr('${zipmap(["a"], [1])}', new Map())).toBeUndefined()
  })

  it('returns undefined for toset of a non-list arg (object literal)', () => {
    expect(resolveListExpr('${toset({a = 1})}', new Map())).toBeUndefined()
  })
})

describe('normalize — concat() resolution', () => {
  it('resolves concat(var.pub, var.priv) with both list defaults', () => {
    const scope = scopeOf({ pub: ['10.0.0.0/8'], priv: ['172.16.0.0/12'] })
    expect(resolveListExpr('${concat(var.pub, var.priv)}', scope)).toEqual([
      '10.0.0.0/8',
      '172.16.0.0/12',
    ])
  })

  it('resolves concat of a literal list and a var ref', () => {
    const scope = scopeOf({ pub: ['10.0.0.0/8'] })
    expect(resolveListExpr('${concat(["literal"], var.pub)}', scope)).toEqual([
      'literal',
      '10.0.0.0/8',
    ])
  })

  it('resolves concat of three lists', () => {
    const scope = scopeOf({ a: [1], b: [2], c: [3] })
    expect(resolveListExpr('${concat(var.a, var.b, var.c)}', scope)).toEqual([
      1, 2, 3,
    ])
  })

  it('resolves nested function calls (concat inside concat)', () => {
    const scope = scopeOf({ a: [1], b: [2], c: [3] })
    expect(
      resolveListExpr('${concat(var.a, concat(var.b, var.c))}', scope),
    ).toEqual([1, 2, 3])
  })

  it('returns undefined when any concat arg is unresolvable (honest)', () => {
    const scope = scopeOf({ pub: ['10.0.0.0/8'] }) // priv has no default
    expect(
      resolveListExpr('${concat(var.pub, var.priv)}', scope),
    ).toBeUndefined()
  })

  it('returns undefined when a concat arg is a non-list scalar', () => {
    const scope = scopeOf({ name: 'x' })
    expect(resolveListExpr('${concat(var.name, ["a"])}', scope)).toBeUndefined()
  })
})

describe('normalize — flatten() resolution', () => {
  it('resolves flatten of a literal list-of-lists (single level)', () => {
    expect(resolveListExpr('${flatten([[1, 2], [3, 4]])}', new Map())).toEqual([
      1, 2, 3, 4,
    ])
  })

  it('resolves flatten([var.a, var.b]) with list defaults', () => {
    const scope = scopeOf({ a: [1, 2], b: [3] })
    expect(resolveListExpr('${flatten([var.a, var.b])}', scope)).toEqual([
      1, 2, 3,
    ])
  })

  it('keeps scalar elements (flatten of a flat list is a no-op)', () => {
    expect(resolveListExpr('${flatten([1, 2, 3])}', new Map())).toEqual([
      1, 2, 3,
    ])
  })

  it('returns undefined when an inner ref is unresolvable (honest)', () => {
    const scope = scopeOf({ a: [1] }) // b has no default
    expect(resolveListExpr('${flatten([var.a, var.b])}', scope)).toBeUndefined()
  })
})

describe('normalize — list-attribute routing (concat/flatten → r.lists)', () => {
  // hcl2json gives `list_attr = concat(...)` as the string '${concat(...)}'.
  // A list-yielding function result must land in r.lists (so listContains /
  // listMustInclude can read it), NEVER in r.attributes (where scalar-attr
  // evaluators would see an array where they expect a scalar). Uses a real
  // known type (aws_s3_bucket) — normalize() skips types outside KNOWN_TYPES.
  const raw = `resource "aws_s3_bucket" "y" {}`

  it('routes a concat() list attribute into r.lists as resolved items', () => {
    const parsed = {
      variable: {
        pub: [{ default: ['10.0.0.0/8'] }],
        priv: [{ default: ['172.16.0.0/12'] }],
      },
      resource: {
        aws_s3_bucket: {
          y: [{ list_attr: '${concat(var.pub, var.priv)}' }],
        },
      },
    }
    const scope = buildScope([parsed])
    const res = normalize(parsed, 'main.tf', raw, scope)
    expect(res[0]?.lists?.list_attr).toEqual({
      kind: 'resolved',
      items: [
        { kind: 'literal', value: '10.0.0.0/8' },
        { kind: 'literal', value: '172.16.0.0/12' },
      ],
    })
    // And it does NOT leak into attributes.
    expect(res[0]?.attributes.list_attr).toBeUndefined()
  })

  it('routes a flatten() list attribute into r.lists', () => {
    const parsed = {
      resource: {
        aws_s3_bucket: { y: [{ flat: '${flatten([[1, 2], [3, 4]])}' }] },
      },
    }
    const res = normalize(parsed, 'main.tf', raw)
    expect(res[0]?.lists?.flat).toEqual({
      kind: 'resolved',
      items: [
        { kind: 'literal', value: 1 },
        { kind: 'literal', value: 2 },
        { kind: 'literal', value: 3 },
        { kind: 'literal', value: 4 },
      ],
    })
    expect(res[0]?.attributes.flat).toBeUndefined()
  })

  it('routes a toset() list attribute into r.lists', () => {
    const parsed = {
      resource: {
        aws_s3_bucket: { y: [{ ports: '${toset([22, 3389])}' }] },
      },
    }
    const res = normalize(parsed, 'main.tf', raw)
    expect(res[0]?.lists?.ports?.kind).toBe('resolved')
    expect(res[0]?.attributes.ports).toBeUndefined()
  })

  it('leaves an unresolvable concat in attributes as unresolved (no lists entry)', () => {
    const parsed = {
      variable: { pub: [{ default: ['10.0.0.0/8'] }] }, // priv missing
      resource: {
        aws_s3_bucket: { y: [{ list_attr: '${concat(var.pub, var.priv)}' }] },
      },
    }
    const scope = buildScope([parsed])
    const res = normalize(parsed, 'main.tf', raw, scope)
    // Could not resolve → stays an unresolved NormalizedValue in attributes
    // (NOT routed to lists, which would imply a known empty/known list).
    expect(res[0]?.attributes.list_attr?.kind).toBe('unresolved')
    expect(res[0]?.lists?.list_attr).toBeUndefined()
  })
})

describe('normalize — ingress cidr_blocks spread from concat()', () => {
  // `cidr_blocks = concat(var.pub, var.priv)` must spread the combined list
  // into the ingress rule's cidrBlocks array (one NormalizedValue per cidr),
  // not nest a single array-valued literal.
  const raw = `resource "aws_security_group" "sg" {}`

  it('spreads a concat() result across ingress cidrBlocks', () => {
    const parsed = {
      variable: {
        pub: [{ default: ['10.0.0.0/8'] }],
        priv: [{ default: ['172.16.0.0/12'] }],
      },
      resource: {
        aws_security_group: {
          sg: [
            {
              ingress: [
                {
                  from_port: 22,
                  to_port: 22,
                  cidr_blocks: '${concat(var.pub, var.priv)}',
                },
              ],
            },
          ],
        },
      },
    }
    const scope = buildScope([parsed])
    const res = normalize(parsed, 'main.tf', raw, scope)
    const cidrs = res[0]?.ingress[0]?.cidrBlocks ?? []
    expect(cidrs).toEqual([
      { kind: 'literal', value: '10.0.0.0/8' },
      { kind: 'literal', value: '172.16.0.0/12' },
    ])
  })

  it('spreads a toset() result across ingress cidrBlocks', () => {
    const parsed = {
      resource: {
        aws_security_group: {
          sg: [
            {
              ingress: [
                {
                  from_port: 443,
                  to_port: 443,
                  cidr_blocks: '${toset(["10.0.0.0/8", "192.168.0.0/16"])}',
                },
              ],
            },
          ],
        },
      },
    }
    const res = normalize(parsed, 'main.tf', raw)
    const cidrs = res[0]?.ingress[0]?.cidrBlocks ?? []
    expect(cidrs.map((c) => (c.kind === 'literal' ? c.value : null))).toEqual([
      '10.0.0.0/8',
      '192.168.0.0/16',
    ])
  })
})

describe('normalize — resolveMergeMap (generalized merge)', () => {
  // The tag-only merge() path (tagKeys) now delegates to resolveMergeMap, a
  // reusable value-producing merge evaluator. It returns the merged map AND a
  // `complete` flag (true iff every arg is fully knowable — merge only adds,
  // so an unresolvable arg means more keys could appear → partial). Object
  // literals with ref VALUES keep key-presence (the partial-key semantic tags
  // rely on) while marking complete=false: `{ Ou = var.ou }` proves Ou is
  // present even though its value is unknowable.

  it('merges two object literals (later wins on conflict)', () => {
    expect(
      resolveMergeMap('${merge({ A = "1" }, { A = "2", B = "3" })}', new Map()),
    ).toEqual({
      map: { A: '2', B: '3' },
      complete: true,
    })
  })

  it('merges an object literal with a ref to a concrete map (complete)', () => {
    const scope = scopeOf({ tags: { Env: 'prod', Team: 'x' } })
    expect(
      resolveMergeMap('${merge({ Ou = "cloud" }, var.tags)}', scope),
    ).toEqual({ map: { Ou: 'cloud', Env: 'prod', Team: 'x' }, complete: true })
  })

  it('marks incomplete when a ref has no default (key-presence preserved)', () => {
    // var.tags unresolvable → could add unknown keys → complete=false. The
    // literal arg's keys still count (merge only adds).
    const scope = buildScope([{ variable: { tags: [{}] } }])
    const r = resolveMergeMap('${merge({ Ou = "cloud" }, var.tags)}', scope)
    expect(r?.complete).toBe(false)
    expect(r?.map).toEqual({ Ou: 'cloud' })
  })

  it('keeps key-presence for an object literal whose VALUES are refs (partial)', () => {
    // `{ Ou = var.ou, Env = "prod" }` — both keys are present (the identifiers
    // are literal), even though Ou's value is unknowable. parseHclValue rejects
    // the WHOLE object when any value is a ref, so resolveMergeMap falls back
    // to key extraction (values undefined) — presence is what tags need.
    // Incompleteness here comes from var.tags (unresolvable), NOT the object:
    // an object-literal arg is always key-complete.
    const scope = scopeOf({ env: 'prod' })
    const r = resolveMergeMap(
      '${merge({ Ou = var.ou, Env = "prod" }, var.tags)}',
      scope,
    )
    expect(r?.complete).toBe(false) // var.tags unresolvable → could add keys
    expect(Object.keys(r?.map ?? {}).sort()).toEqual(['Env', 'Ou'])
    // Values undefined in the fallback path (mixed ref/literal object).
    expect(r?.map.Ou).toBeUndefined()
    expect(r?.map.Env).toBeUndefined()
  })

  it('produces literal VALUES when every object entry is a literal (value-producing)', () => {
    // The value-producing case: a fully-literal object resolves to real values,
    // not just key presence. Forward-looking for any future map-valued consumer.
    expect(
      resolveMergeMap('${merge({ A = "1", B = "2" })}', new Map()),
    ).toEqual({ map: { A: '1', B: '2' }, complete: true })
  })

  it('resolves a nested merge() argument (merge inside merge)', () => {
    const scope = scopeOf({ d: { D: '4' } })
    expect(
      resolveMergeMap(
        '${merge({ A = "1" }, merge({ B = "2" }, var.d))}',
        scope,
      ),
    ).toEqual({ map: { A: '1', B: '2', D: '4' }, complete: true })
  })

  it('resolves a sole ref to a merge expression in scope', () => {
    // local.common = "${merge({A=1},{B=2})}" — a ref whose value is itself a
    // merge expr. resolveMergeMap follows the ref and recurses.
    const scope = buildScope([
      { locals: [{ common: '${merge({ A = "1" }, { B = "2" })}' }] },
    ])
    expect(resolveMergeMap('${local.common}', scope)).toEqual({
      map: { A: '1', B: '2' },
      complete: true,
    })
  })

  it('returns null for a non-merge, non-ref string (opaque)', () => {
    expect(resolveMergeMap('${concat(var.a, var.b)}', new Map())).toBeNull()
    expect(resolveMergeMap('${unknown_fn()}', new Map())).toBeNull()
  })

  it('returns null for an unresolvable sole ref (no scope entry)', () => {
    expect(resolveMergeMap('${var.missing}', new Map())).toBeNull()
  })

  it('handles a direct object-literal value (not a merge call)', () => {
    expect(resolveMergeMap({ A: '1', B: '2' }, new Map())).toEqual({
      map: { A: '1', B: '2' },
      complete: true,
    })
  })
})

describe('normalize — tagKeys delegates to resolveMergeMap (no regression)', () => {
  const raw = `resource "aws_s3_bucket" "a" {}`

  it('merge of two literals → complete tag set', () => {
    const parsed = {
      resource: {
        aws_s3_bucket: {
          a: [{ tags: '${merge({ Team = "x" }, { Env = "prod" })}' }],
        },
      },
    }
    const res = normalize(parsed, 'main.tf', raw)
    expect(res[0]?.tags).toEqual({
      kind: 'resolved',
      keys: ['Team', 'Env'],
    })
  })

  it('merge with an unresolvable ref → partial (key proves presence)', () => {
    const parsed = {
      variable: { tags: [{}] }, // no default
      resource: {
        aws_s3_bucket: {
          a: [{ tags: '${merge({ Team = "x" }, var.tags)}' }],
        },
      },
    }
    const scope = buildScope([parsed])
    const res = normalize(parsed, 'main.tf', raw, scope)
    expect(res[0]?.tags).toEqual({ kind: 'partial', keys: ['Team'] })
  })
})

describe('normalize — resource for_each = toset(...) expansion', () => {
  it('expands for_each = toset(["dev","prd"]) into two instances', () => {
    const parsed = {
      resource: {
        aws_s3_bucket: {
          a: [
            {
              for_each: '${toset(["dev", "prd"])}',
              bucket: '${each.value}',
            },
          ],
        },
      },
    }
    const res = normalize(parsed, 'main.tf', raw)
    expect(res).toHaveLength(2)
    expect(res.map((r) => r.instanceKey).sort()).toEqual(['dev', 'prd'])
    const dev = res.find((r) => r.instanceKey === 'dev')
    expect(dev?.attributes.bucket).toEqual({ kind: 'literal', value: 'dev' })
  })

  it('expands for_each = toset(var.envs) when var.envs is a literal list', () => {
    const parsed = {
      variable: { envs: [{ default: ['stg', 'prd'] }] },
      resource: {
        aws_s3_bucket: {
          a: [
            {
              for_each: '${toset(var.envs)}',
              bucket: '${each.value}-bucket',
            },
          ],
        },
      },
    }
    const scope = buildScope([parsed])
    const res = normalize(parsed, 'main.tf', raw, scope)
    expect(res).toHaveLength(2)
    expect(res.map((r) => r.instanceKey).sort()).toEqual(['prd', 'stg'])
  })

  it('silently skips a resource with for_each = toset([]) (empty set)', () => {
    const parsed = {
      resource: {
        aws_s3_bucket: {
          a: [{ for_each: '${toset([])}', bucket: 'a' }],
          b: [{ bucket: 'b' }],
        },
      },
    }
    const res = normalize(parsed, 'main.tf', raw)
    expect(res.map((r) => r.name)).toEqual(['b'])
  })

  it('follows once when for_each = toset(var.unset) (unresolvable, honest)', () => {
    const parsed = {
      variable: { unset: [{}] },
      resource: {
        aws_s3_bucket: {
          a: [{ for_each: '${toset(var.unset)}', bucket: 'a' }],
        },
      },
    }
    const scope = buildScope([parsed])
    const res = normalize(parsed, 'main.tf', raw, scope)
    // One instance, no instanceKey (could not expand).
    expect(res).toHaveLength(1)
    expect(res[0]?.instanceKey).toBeUndefined()
  })
})
