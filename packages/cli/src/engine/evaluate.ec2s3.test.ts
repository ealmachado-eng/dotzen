import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource, NormalizedValue, PolicyInfo } from '../hcl/model'
import { AwsResource, AwsAttribute, Effect } from '../vocabulary'

const bool = (v: boolean): NormalizedValue => ({ kind: 'literal', value: v })

const instance = (
  attributes: Record<string, NormalizedValue>,
): NormalizedResource => ({
  type: AwsResource.Instance,
  name: 'app',
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes,
})

describe('evaluate — EC2 root volume + public IP', () => {
  it('flags an unencrypted root block device (nested attribute)', () => {
    const rule: Rule = {
      id: 'ec2-root-enc',
      target: { kind: 'resource', types: [AwsResource.Instance] },
      conditions: [
        { kind: 'mustBeTrue', attrs: [AwsAttribute.RootBlockDeviceEncrypted] },
      ],
      effect: Effect.Block,
      message: 'root volume must be encrypted',
    }
    const r = instance({ 'root_block_device.encrypted': bool(false) })
    expect(evaluate([rule], [r]).violations).toHaveLength(1)
  })

  it('flags an instance that auto-assigns a public IP', () => {
    const rule: Rule = {
      id: 'ec2-no-public-ip',
      target: { kind: 'resource', types: [AwsResource.Instance] },
      conditions: [
        {
          kind: 'denyWhenTrue',
          attrs: [AwsAttribute.AssociatePublicIpAddress],
        },
      ],
      effect: Effect.Block,
      message: 'no public IP',
    }
    const r = instance({ associate_public_ip_address: bool(true) })
    expect(evaluate([rule], [r]).violations).toHaveLength(1)
  })
})

describe('evaluate — S3 bucket policy wildcard (reuses IAM parser)', () => {
  const rule: Rule = {
    id: 's3-policy-wildcard',
    target: { kind: 'resource', types: [AwsResource.S3BucketPolicy] },
    conditions: [{ kind: 'denyIamWildcard' }],
    effect: Effect.Block,
    message: 'bucket policy must not grant Action *',
  }
  const policy = (p: PolicyInfo): NormalizedResource => ({
    type: AwsResource.S3BucketPolicy,
    name: 'b',
    file: 'main.tf',
    line: 1,
    ingress: [],
    tags: { kind: 'resolved', keys: [] },
    attributes: {},
    policy: p,
  })

  it('flags a bucket policy granting Action "*"', () => {
    const r = policy({
      kind: 'parsed',
      statements: [
        {
          effect: 'Allow',
          actions: ['*'],
          resources: ['*'],
          notActions: [],
          principals: [],
          conditions: {},
        },
      ],
    })
    expect(evaluate([rule], [r]).violations).toHaveLength(1)
  })
})
