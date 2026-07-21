import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { rule, Rule } from '../spec/rule'
import { NormalizedResource, PolicyInfo, PolicyStatement } from '../hcl/model'
import { normalize } from '../hcl/normalize'
import { AwsResource } from '../vocabulary'

const sslRule = (
  rule()
    .resource(AwsResource.S3BucketPolicy)
    .requireSslOnlyPolicy()
    .message('S3 bucket policy must deny non-SSL transport')
    .rationale('CIS AWS — deny requests where aws:SecureTransport is false')
    .validate(0) as { ok: true; value: Rule }
).value

const res = (policy?: PolicyInfo): NormalizedResource => ({
  type: AwsResource.S3BucketPolicy,
  name: 'bucket_policy',
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes: {},
  policy,
})

const stmt = (s: {
  effect: string
  actions?: string[]
  resources?: string[]
  conditions?: Record<string, Record<string, string[]>>
}): PolicyStatement => ({
  effect: s.effect,
  actions: s.actions ?? [],
  resources: s.resources ?? [],
  notActions: [],
  principals: [],
  conditions: s.conditions ?? {},
})

const policy = (statements: PolicyStatement[]): PolicyInfo => ({
  kind: 'parsed',
  statements,
})

const SECURE_TRANSPORT_FALSE = {
  Bool: { 'aws:SecureTransport': ['false'] },
}

describe('evaluate (requireSslOnlyPolicy)', () => {
  it('passes a policy with a Deny + aws:SecureTransport=false condition', () => {
    const r = evaluate(
      [sslRule],
      [
        res(
          policy([
            stmt({
              effect: 'Deny',
              actions: ['s3:*'],
              resources: ['arn:aws:s3:::bucket/*'],
              conditions: SECURE_TRANSPORT_FALSE,
            }),
          ]),
        ),
      ],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('flags a policy with only Allow statements (no SSL Deny)', () => {
    const r = evaluate(
      [sslRule],
      [
        res(
          policy([
            stmt({
              effect: 'Allow',
              actions: ['s3:GetObject'],
              resources: ['arn:aws:s3:::bucket/*'],
            }),
          ]),
        ),
      ],
    )
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.message).toMatch(/non-SSL/)
  })

  it('flags a policy with a Deny but no Condition block', () => {
    const r = evaluate(
      [sslRule],
      [
        res(
          policy([
            stmt({
              effect: 'Deny',
              actions: ['s3:*'],
              resources: ['arn:aws:s3:::bucket/*'],
            }),
          ]),
        ),
      ],
    )
    expect(r.violations).toHaveLength(1)
  })

  it('flags a policy with a Deny but wrong aws:SecureTransport value', () => {
    const r = evaluate(
      [sslRule],
      [
        res(
          policy([
            stmt({
              effect: 'Deny',
              actions: ['s3:*'],
              resources: ['arn:aws:s3:::bucket/*'],
              conditions: {
                Bool: { 'aws:SecureTransport': ['true'] },
              },
            }),
          ]),
        ),
      ],
    )
    expect(r.violations).toHaveLength(1)
  })

  it('passes a policy with a case-insensitive "False" value', () => {
    const r = evaluate(
      [sslRule],
      [
        res(
          policy([
            stmt({
              effect: 'Deny',
              actions: ['s3:*'],
              resources: ['arn:aws:s3:::bucket/*'],
              conditions: {
                Bool: { 'aws:SecureTransport': ['False'] },
              },
            }),
          ]),
        ),
      ],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('could-not-evaluate for an unresolved policy', () => {
    const r = evaluate([sslRule], [res({ kind: 'unresolved' })])
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(1)
  })

  it('passes a resource with no policy document', () => {
    const r = evaluate([sslRule], [res(undefined)])
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })
})

describe('evaluate (requireSslOnlyPolicy) — end-to-end through normalize', () => {
  it('passes a literal-JSON bucket policy with an SSL Deny statement', () => {
    const sslPolicy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Deny',
          Principal: '*',
          Action: 's3:*',
          Resource: ['arn:aws:s3:::b', 'arn:aws:s3:::b/*'],
          Condition: { Bool: { 'aws:SecureTransport': 'false' } },
        },
      ],
    })
    const parsed = {
      resource: {
        aws_s3_bucket_policy: {
          good: [{ policy: sslPolicy }],
        },
      },
    }
    const resources = normalize(parsed, 'main.tf', '', undefined as never)
    const report = evaluate([sslRule], resources)
    expect(report.violations).toHaveLength(0)
    expect(report.passed).toBe(1)
  })

  it('flags a literal-JSON bucket policy with no SSL Deny statement', () => {
    const noSslPolicy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: 'arn:aws:s3:::b/*',
        },
      ],
    })
    const parsed = {
      resource: {
        aws_s3_bucket_policy: {
          bad: [{ policy: noSslPolicy }],
        },
      },
    }
    const resources = normalize(parsed, 'main.tf', '', undefined as never)
    const report = evaluate([sslRule], resources)
    expect(report.violations).toHaveLength(1)
    expect(report.couldNotEvaluate).toHaveLength(0)
  })

  it('passes a jsonencode(...) bucket policy with an SSL Deny statement', () => {
    const parsed = {
      resource: {
        aws_s3_bucket_policy: {
          encoded: [
            {
              policy:
                '${jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Deny", Action = "s3:*", Resource = "*", Condition = { Bool = { "aws:SecureTransport" = "false" } } }] })}',
            },
          ],
        },
      },
    }
    const resources = normalize(parsed, 'main.tf', '', undefined as never)
    const report = evaluate([sslRule], resources)
    expect(report.violations).toHaveLength(0)
    expect(report.passed).toBe(1)
  })
})
