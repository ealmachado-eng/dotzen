import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
import { AwsResource, AwsAttribute, Effect } from '../vocabulary'

const lit = (v: string | number | boolean): NormalizedValue => ({
  kind: 'literal',
  value: v,
})
const ref = (expr: string): NormalizedValue => ({ kind: 'unresolved', expr })

const res = (
  type: AwsResource,
  attributes: Record<string, NormalizedValue>,
): NormalizedResource => ({
  type,
  name: 'x',
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes,
})

describe('evaluate — mustBeSet (attribute presence)', () => {
  const rule: Rule = {
    id: 'ct-kms',
    target: { kind: 'resource', types: [AwsResource.Cloudtrail] },
    conditions: [{ kind: 'mustBeSet', attrs: [AwsAttribute.KmsKeyId] }],
    effect: Effect.Block,
    message: 'CloudTrail must be KMS-encrypted',
  }

  it('flags a trail with no kms_key_id', () => {
    const trail = res(AwsResource.Cloudtrail, {
      is_multi_region_trail: lit(true),
    })
    expect(evaluate([rule], [trail]).violations).toHaveLength(1)
  })

  it('passes when kms_key_id is set to a reference', () => {
    const trail = res(AwsResource.Cloudtrail, {
      kms_key_id: ref('${aws_kms_key.ct.arn}'),
    })
    expect(evaluate([rule], [trail]).violations).toHaveLength(0)
  })
})

describe('evaluate — CloudTrail + password policy (reuses existing conditions)', () => {
  it('flags a trail missing multi-region + log-file validation', () => {
    const rule: Rule = {
      id: 'ct',
      target: { kind: 'resource', types: [AwsResource.Cloudtrail] },
      conditions: [
        {
          kind: 'mustBeTrue',
          attrs: [
            AwsAttribute.IsMultiRegionTrail,
            AwsAttribute.EnableLogFileValidation,
          ],
        },
      ],
      effect: Effect.Block,
      message: 'trail hardening',
    }
    const trail = res(AwsResource.Cloudtrail, {})
    expect(evaluate([rule], [trail]).violations).toHaveLength(1)
  })

  it('flags a weak password policy (length below 14)', () => {
    const rule: Rule = {
      id: 'pw',
      target: {
        kind: 'resource',
        types: [AwsResource.IamAccountPasswordPolicy],
      },
      conditions: [
        {
          kind: 'mustBeAtLeast',
          attr: AwsAttribute.MinimumPasswordLength,
          min: 14,
        },
      ],
      effect: Effect.Block,
      message: 'password length',
    }
    const pol = res(AwsResource.IamAccountPasswordPolicy, {
      minimum_password_length: lit(8),
    })
    expect(evaluate([rule], [pol]).violations).toHaveLength(1)
  })
})
