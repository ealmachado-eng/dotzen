import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { normalize, buildScope } from '../hcl/normalize'
import { rule, Rule } from '../spec/rule'
import { AwsResource, LifecycleAttribute } from '../vocabulary'

const valid = (b: ReturnType<typeof rule>): Rule =>
  (b.validate(0) as { ok: true; value: Rule }).value

// lifecycle { prevent_destroy = true } is a nested block → normalize flattens
// it to the attribute `lifecycle.prevent_destroy` (NOT a meta-arg; it is kept
// out of RESOURCE_META so `collect` recurses into it). The existing
// `mustBeTrue` condition governs it with no new condition kind.
describe('evaluate — lifecycle.prevent_destroy (mustBeTrue through normalize)', () => {
  const rule_ = valid(
    rule()
      .resource(AwsResource.DbInstance)
      .mustBeTrue(LifecycleAttribute.PreventDestroy)
      .message('stateful DB must resist accidental destroy (prevent_destroy)'),
  )

  it('flags a DB without prevent_destroy', () => {
    const parsed = {
      resource: {
        aws_db_instance: { x: [{ storage_encrypted: true }] },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    const r = evaluate([rule_], res)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('aws_db_instance.x')
  })

  it('passes a DB with lifecycle { prevent_destroy = true }', () => {
    const parsed = {
      resource: {
        aws_db_instance: {
          x: [
            {
              storage_encrypted: true,
              lifecycle: [{ prevent_destroy: true }],
            },
          ],
        },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    const r = evaluate([rule_], res)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('degrades to could-not-evaluate when prevent_destroy is a var ref', () => {
    const parsed = {
      variable: { lock: [{}] },
      resource: {
        aws_db_instance: {
          x: [
            {
              storage_encrypted: true,
              lifecycle: [{ prevent_destroy: '${var.lock}' }],
            },
          ],
        },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    const r = evaluate([rule_], res)
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(1)
  })

  it('normalize harvests lifecycle.* as dotted attributes (block path recorded)', () => {
    const parsed = {
      resource: {
        aws_db_instance: {
          x: [
            {
              storage_encrypted: true,
              lifecycle: [
                { prevent_destroy: true, create_before_destroy: false },
              ],
            },
          ],
        },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    const x = res[0]!
    expect(x.attributes['lifecycle.prevent_destroy']).toEqual({
      kind: 'literal',
      value: true,
    })
    expect(x.attributes['lifecycle.create_before_destroy']).toEqual({
      kind: 'literal',
      value: false,
    })
    expect(x.blocks).toContain('lifecycle')
    // count/for_each are NOT leaked (still filtered); lifecycle is kept.
    expect(x.attributes.count).toBeUndefined()
  })
})

describe('evaluate — lifecycle.ignore_changes (denyIgnoreChanges)', () => {
  // ignore_changes entries are attribute PATHS; hcl2json wraps bare
  // identifiers as `${tags}`. `denyIgnoreChanges` strips the wrapper, so it
  // matches both the real `${tags}` form and a literal `"tags"` form.
  const noIgnoreTags = valid(
    rule()
      .resource(AwsResource.S3Bucket)
      .denyIgnoreChanges('tags')
      .message('must not hide drift on the tags attribute'),
  )

  it('flags a resource ignoring drift via the real hcl2json form (${tags})', () => {
    const parsed = {
      resource: {
        aws_s3_bucket: {
          x: [
            { lifecycle: [{ ignore_changes: ['${tags}', '${encryption}'] }] },
          ],
        },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    const r = evaluate([noIgnoreTags], res)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('aws_s3_bucket.x')
  })

  it('also matches a literal-string ignore_changes entry', () => {
    const parsed = {
      resource: {
        aws_s3_bucket: {
          x: [{ lifecycle: [{ ignore_changes: ['tags'] }] }],
        },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    const r = evaluate([noIgnoreTags], res)
    expect(r.violations).toHaveLength(1)
  })

  it('passes a resource whose ignore_changes omits the flagged attr', () => {
    const parsed = {
      resource: {
        aws_s3_bucket: {
          x: [{ lifecycle: [{ ignore_changes: ['${bucket}'] }] }],
        },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    const r = evaluate([noIgnoreTags], res)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('passes a resource with no lifecycle block', () => {
    const parsed = { resource: { aws_s3_bucket: { x: [{}] } } }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    const r = evaluate([noIgnoreTags], res)
    expect(r.violations).toHaveLength(0)
  })
})
