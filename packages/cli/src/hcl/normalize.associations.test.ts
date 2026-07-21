import { describe, it, expect } from 'vitest'
import { normalize, buildScope } from './normalize'

const raw = `resource "aws_s3_bucket" "main" {}
resource "aws_s3_bucket_server_side_encryption_configuration" "main" {
  bucket = local.bucket_id
}
resource "aws_s3_bucket_server_side_encryption_configuration" "var_ref" {
  bucket = var.bucket_id
}`

describe('normalize — cross-resource ref resolution through var/local', () => {
  it('surfaces resolvedRef when a local chains to a resource ref', () => {
    // `bucket = local.bucket_id` where `local.bucket_id = aws_s3_bucket.main.id`.
    // resolveValue already follows the chain — the bottom expr is the
    // resource ref — and resolvedRef makes the link explicit structured data
    // (so the engine does not need to know about var/local prefix conventions).
    const parsed = {
      locals: [{ bucket_id: '${aws_s3_bucket.main.id}' }],
      resource: {
        aws_s3_bucket: { main: [{}] },
        aws_s3_bucket_server_side_encryption_configuration: {
          main: [{ bucket: '${local.bucket_id}' }],
        },
      },
    }
    const scope = buildScope([parsed as never])
    const r = normalize(parsed as never, 'main.tf', raw, scope).find(
      (x) =>
        x.type === 'aws_s3_bucket_server_side_encryption_configuration' &&
        x.name === 'main',
    )
    const bucket = r?.attributes.bucket
    expect(bucket?.kind).toBe('unresolved')
    if (bucket?.kind === 'unresolved') {
      expect(bucket.resolvedRef).toEqual({
        type: 'aws_s3_bucket',
        name: 'main',
      })
      // The expr is the BOTTOM of the chain (the resource ref), as today.
      expect(bucket.expr).toBe('${aws_s3_bucket.main.id}')
    }
  })

  it('surfaces resolvedRef through a local→var→local chain', () => {
    const parsed = {
      locals: [
        { a: '${local.b}' },
        { b: '${var.c}' },
        { c: '${aws_s3_bucket.x.id}' },
      ],
      variable: { c: [{ default: '${local.c}' }] },
      resource: {
        aws_s3_bucket: { x: [{}] },
        aws_s3_bucket_server_side_encryption_configuration: {
          y: [{ bucket: '${local.a}' }],
        },
      },
    }
    const scope = buildScope([parsed as never])
    const r = normalize(parsed as never, 'main.tf', raw, scope).find(
      (x) => x.name === 'y',
    )
    const bucket = r?.attributes.bucket
    expect(bucket?.kind).toBe('unresolved')
    if (bucket?.kind === 'unresolved')
      expect(bucket.resolvedRef).toEqual({
        type: 'aws_s3_bucket',
        name: 'x',
      })
  })

  it('leaves resolvedRef undefined when the var/local chain is unresolvable', () => {
    // `bucket = var.bucket_id` with no default and no module input — the
    // chain bottoms out at the unresolvable `${var.bucket_id}`, so no
    // resource ref is reachable. This is the case the engine must degrade
    // to couldNotEvaluate on (today it false-violates).
    const parsed = {
      variable: { bucket_id: [{ type: '${string}' }] }, // no default
      resource: {
        aws_s3_bucket_server_side_encryption_configuration: {
          var_ref: [{ bucket: '${var.bucket_id}' }],
        },
      },
    }
    const scope = buildScope([parsed as never])
    const r = normalize(parsed as never, 'main.tf', raw, scope).find(
      (x) => x.name === 'var_ref',
    )
    const bucket = r?.attributes.bucket
    expect(bucket?.kind).toBe('unresolved')
    if (bucket?.kind === 'unresolved') {
      expect(bucket.resolvedRef).toBeUndefined()
      expect(bucket.expr).toBe('${var.bucket_id}')
    }
  })

  it('leaves resolvedRef undefined when a local chains to an unresolvable var', () => {
    // `bucket = local.x` where `local.x = var.y` (no default) — the chain
    // bottoms out at `${var.y}`. No resource ref reachable.
    const parsed = {
      locals: [{ x: '${var.y}' }],
      variable: { y: [{ type: '${string}' }] },
      resource: {
        aws_s3_bucket_server_side_encryption_configuration: {
          z: [{ bucket: '${local.x}' }],
        },
      },
    }
    const scope = buildScope([parsed as never])
    const r = normalize(parsed as never, 'main.tf', raw, scope).find(
      (x) => x.name === 'z',
    )
    const bucket = r?.attributes.bucket
    expect(bucket?.kind).toBe('unresolved')
    if (bucket?.kind === 'unresolved') {
      expect(bucket.resolvedRef).toBeUndefined()
      expect(bucket.expr).toBe('${var.y}')
    }
  })

  it('surfaces resolvedRef for a direct (non-var/local) resource ref too', () => {
    // Consistent behavior: a direct `${aws_s3_bucket.x.id}` also carries
    // resolvedRef — the engine can use one uniform signal for both direct
    // refs and var/local chains that bottom out at a resource ref.
    const parsed = {
      resource: {
        aws_s3_bucket: { x: [{}] },
        aws_s3_bucket_server_side_encryption_configuration: {
          y: [{ bucket: '${aws_s3_bucket.x.id}' }],
        },
      },
    }
    const r = normalize(parsed as never, 'main.tf', raw).find(
      (x) => x.name === 'y',
    )
    const bucket = r?.attributes.bucket
    expect(bucket?.kind).toBe('unresolved')
    if (bucket?.kind === 'unresolved') {
      expect(bucket.resolvedRef).toEqual({
        type: 'aws_s3_bucket',
        name: 'x',
      })
      expect(bucket.expr).toBe('${aws_s3_bucket.x.id}')
    }
  })

  it('does not surface resolvedRef for a chain that bottoms out at a literal', () => {
    const parsed = {
      locals: [{ bucket_id: 'my-bucket-name' }],
      resource: {
        aws_s3_bucket_server_side_encryption_configuration: {
          y: [{ bucket: '${local.bucket_id}' }],
        },
      },
    }
    const scope = buildScope([parsed as never])
    const r = normalize(parsed as never, 'main.tf', raw, scope).find(
      (x) => x.name === 'y',
    )
    // A literal string is not a resource ref; resolveValue already
    // resolves it to a literal NormalizedValue (so attributes.bucket.kind
    // is 'literal', not 'unresolved').
    expect(r?.attributes.bucket).toEqual({
      kind: 'literal',
      value: 'my-bucket-name',
    })
  })

  it('does not surface resolvedRef for a compound interpolation', () => {
    // `bucket = "prefix-${var.x}"` is not a sole ref; resolveValue leaves
    // it unresolved with the compound expr, and refAtBottom finds no match.
    const parsed = {
      resource: {
        aws_s3_bucket_server_side_encryption_configuration: {
          y: [{ bucket: 'prefix-${var.x}' }],
        },
      },
    }
    const r = normalize(parsed as never, 'main.tf', raw).find(
      (x) => x.name === 'y',
    )
    const bucket = r?.attributes.bucket
    expect(bucket?.kind).toBe('unresolved')
    if (bucket?.kind === 'unresolved') {
      expect(bucket.resolvedRef).toBeUndefined()
      expect(bucket.expr).toBe('prefix-${var.x}')
    }
  })
})
