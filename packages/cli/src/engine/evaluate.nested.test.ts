import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
import { AwsResource, AwsAttribute, HttpTokens, Effect } from '../vocabulary'

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

const lit = (v: string | number): NormalizedValue => ({
  kind: 'literal',
  value: v,
})

const imdsv2: Rule = {
  id: 'imdsv2',
  target: { kind: 'resource', types: [AwsResource.Instance] },
  conditions: [
    {
      kind: 'mustEqual',
      attr: AwsAttribute.HttpTokens,
      value: HttpTokens.Required,
    },
  ],
  effect: Effect.Block,
  message: 'EC2 must require IMDSv2',
}

describe('evaluate (mustEqual — IMDSv2)', () => {
  it('passes when http_tokens equals required', () => {
    const r = evaluate(
      [imdsv2],
      [
        res(AwsResource.Instance, {
          'metadata_options.http_tokens': lit('required'),
        }),
      ],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('flags optional (IMDSv1)', () => {
    const r = evaluate(
      [imdsv2],
      [
        res(AwsResource.Instance, {
          'metadata_options.http_tokens': lit('optional'),
        }),
      ],
    )
    expect(r.violations).toHaveLength(1)
  })

  it('flags when metadata_options is absent (defaults to IMDSv1)', () => {
    expect(
      evaluate([imdsv2], [res(AwsResource.Instance, {})]).violations,
    ).toHaveLength(1)
  })

  it('could-not-evaluate when unresolved', () => {
    const r = evaluate(
      [imdsv2],
      [
        res(AwsResource.Instance, {
          'metadata_options.http_tokens': {
            kind: 'unresolved',
            expr: '${var.t}',
          },
        }),
      ],
    )
    expect(r.couldNotEvaluate).toHaveLength(1)
  })
})

const backup: Rule = {
  id: 'rds-backup',
  target: { kind: 'resource', types: [AwsResource.DbInstance] },
  conditions: [
    { kind: 'mustBeAtLeast', attr: AwsAttribute.BackupRetentionPeriod, min: 7 },
  ],
  effect: Effect.Block,
  message: 'RDS backup retention must be >= 7 days',
}

describe('evaluate (mustBeAtLeast)', () => {
  it('passes at or above the threshold', () => {
    expect(
      evaluate(
        [backup],
        [res(AwsResource.DbInstance, { backup_retention_period: lit(7) })],
      ).violations,
    ).toHaveLength(0)
  })

  it('flags below the threshold', () => {
    expect(
      evaluate(
        [backup],
        [res(AwsResource.DbInstance, { backup_retention_period: lit(1) })],
      ).violations,
    ).toHaveLength(1)
  })

  it('flags when the attribute is absent', () => {
    expect(
      evaluate([backup], [res(AwsResource.DbInstance, {})]).violations,
    ).toHaveLength(1)
  })
})
