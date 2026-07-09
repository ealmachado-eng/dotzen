import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
import { AwsResource, Acl, Effect } from '../vocabulary'

const denyPublicAcl: Rule = {
  id: 's3-no-public-acl',
  target: { kind: 'resource', types: [AwsResource.S3Bucket] },
  conditions: [
    { kind: 'denyAcl', acls: [Acl.PublicRead, Acl.PublicReadWrite] },
  ],
  effect: Effect.Block,
  message: 'S3 buckets must not have a public ACL',
}

const bucket = (acl?: NormalizedValue): NormalizedResource => ({
  type: AwsResource.S3Bucket,
  name: 'b',
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes: acl ? { acl } : {},
})

const lit = (v: string): NormalizedValue => ({ kind: 'literal', value: v })

describe('evaluate (denyAcl)', () => {
  it('flags a public-read ACL', () => {
    const r = evaluate([denyPublicAcl], [bucket(lit('public-read'))])
    expect(r.violations).toHaveLength(1)
  })

  it('passes a private ACL', () => {
    const r = evaluate([denyPublicAcl], [bucket(lit('private'))])
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('passes when no ACL is set (default private)', () => {
    expect(evaluate([denyPublicAcl], [bucket()]).violations).toHaveLength(0)
  })

  it('reports couldNotEvaluate when the ACL is unresolved', () => {
    const r = evaluate(
      [denyPublicAcl],
      [bucket({ kind: 'unresolved', expr: '${var.acl}' })],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(1)
  })

  it('catches the modern separate aws_s3_bucket_acl resource', () => {
    // rule targets aws_s3_bucket; the ACL lives on the decomposed resource
    const aclResource: NormalizedResource = {
      type: AwsResource.S3BucketAcl,
      name: 'b',
      file: 'main.tf',
      line: 1,
      ingress: [],
      tags: { kind: 'resolved', keys: [] },
      attributes: { acl: lit('public-read') },
    }
    const r = evaluate([denyPublicAcl], [aclResource])
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('aws_s3_bucket_acl.b')
  })
})
