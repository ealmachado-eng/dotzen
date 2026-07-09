import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
import { AwsResource, AwsAttribute, Effect, Block } from '../vocabulary'

const ref = (expr: string): NormalizedValue => ({ kind: 'unresolved', expr })

const base = (
  type: AwsResource,
  name: string,
  attributes: Record<string, NormalizedValue> = {},
): NormalizedResource => ({
  type,
  name,
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes,
})

describe('evaluate — mustHaveAssociated (cross-resource presence)', () => {
  const rule: Rule = {
    id: 's3-sse',
    target: { kind: 'resource', types: [AwsResource.S3Bucket] },
    conditions: [
      {
        kind: 'mustHaveAssociated',
        childType: AwsResource.S3BucketServerSideEncryptionConfiguration,
        via: AwsAttribute.Bucket,
      },
    ],
    effect: Effect.Block,
    message: 'bucket must have server-side encryption configured',
  }

  it('passes a bucket that a SSE-config resource references', () => {
    const bucket = base(AwsResource.S3Bucket, 'data')
    const sse = base(
      AwsResource.S3BucketServerSideEncryptionConfiguration,
      'data',
      { bucket: ref('${aws_s3_bucket.data.id}') },
    )
    const report = evaluate([rule], [bucket, sse])
    expect(report.violations).toHaveLength(0)
    expect(report.passed).toBe(1)
  })

  it('flags a bucket with no associated SSE-config resource', () => {
    const bucket = base(AwsResource.S3Bucket, 'lonely')
    expect(evaluate([rule], [bucket]).violations).toHaveLength(1)
  })

  it('does not link a SSE-config that references a different bucket', () => {
    const bucket = base(AwsResource.S3Bucket, 'data')
    const sse = base(
      AwsResource.S3BucketServerSideEncryptionConfiguration,
      'other',
      { bucket: ref('${aws_s3_bucket.somewhere_else.id}') },
    )
    expect(evaluate([rule], [bucket, sse]).violations).toHaveLength(1)
  })
})

describe('evaluate — mustHaveBlock (same-resource block presence)', () => {
  const rule: Rule = {
    id: 'eks-enc',
    target: { kind: 'resource', types: [AwsResource.EksCluster] },
    conditions: [{ kind: 'mustHaveBlock', block: Block.EncryptionConfig }],
    effect: Effect.Block,
    message: 'EKS cluster must configure envelope encryption',
  }

  it('passes a cluster that declares encryption_config', () => {
    const cluster: NormalizedResource = {
      ...base(AwsResource.EksCluster, 'main', {
        'encryption_config.provider.key_arn': ref('${aws_kms_key.eks.arn}'),
      }),
      lists: {
        'encryption_config.resources': {
          kind: 'resolved',
          items: [{ kind: 'literal', value: 'secrets' }],
        },
      },
    }
    expect(evaluate([rule], [cluster]).violations).toHaveLength(0)
  })

  it('flags a cluster with no encryption_config block', () => {
    const cluster = base(AwsResource.EksCluster, 'plain')
    expect(evaluate([rule], [cluster]).violations).toHaveLength(1)
  })
})
