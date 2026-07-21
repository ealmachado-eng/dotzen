import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { rule, Rule } from '../spec/rule'
import { NormalizedResource, PolicyInfo, PolicyStatement } from '../hcl/model'
import { normalize } from '../hcl/normalize'
import { AwsResource } from '../vocabulary'

const principalRule = (
  rule()
    .resource(AwsResource.S3BucketPolicy)
    .denyPublicPrincipal()
    .message('S3 bucket policies must not grant public access (Principal "*")')
    .rationale('CIS AWS — no public Principal in Allow statements')
    .validate(0) as { ok: true; value: Rule }
).value

const res = (policy?: PolicyInfo): NormalizedResource => ({
  type: AwsResource.S3BucketPolicy,
  name: 'bp',
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
  principals?: string[]
}): PolicyStatement => ({
  effect: s.effect,
  actions: s.actions ?? [],
  resources: s.resources ?? [],
  notActions: [],
  principals: s.principals ?? [],
  conditions: {},
})

const policy = (statements: PolicyStatement[]): PolicyInfo => ({
  kind: 'parsed',
  statements,
})

describe('evaluate (denyPublicPrincipal)', () => {
  it('flags an Allow with Principal "*"', () => {
    const r = evaluate(
      [principalRule],
      [
        res(
          policy([
            stmt({
              effect: 'Allow',
              actions: ['s3:GetObject'],
              resources: ['arn:aws:s3:::b/*'],
              principals: ['*'],
            }),
          ]),
        ),
      ],
    )
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.message).toMatch(/public/)
  })

  it('passes an Allow with a specific AWS ARN Principal', () => {
    const r = evaluate(
      [principalRule],
      [
        res(
          policy([
            stmt({
              effect: 'Allow',
              actions: ['s3:GetObject'],
              resources: ['arn:aws:s3:::b/*'],
              principals: ['arn:aws:iam::123456789012:root'],
            }),
          ]),
        ),
      ],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('passes a Deny with Principal "*" (restrictive, not public)', () => {
    const r = evaluate(
      [principalRule],
      [
        res(
          policy([
            stmt({
              effect: 'Deny',
              actions: ['s3:*'],
              resources: ['arn:aws:s3:::b/*'],
              principals: ['*'],
            }),
          ]),
        ),
      ],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('passes an Allow with no Principal', () => {
    const r = evaluate(
      [principalRule],
      [
        res(
          policy([
            stmt({
              effect: 'Allow',
              actions: ['s3:GetObject'],
              resources: ['arn:aws:s3:::b/*'],
            }),
          ]),
        ),
      ],
    )
    expect(r.violations).toHaveLength(0)
  })

  it('could-not-evaluate for an unresolved policy', () => {
    const r = evaluate([principalRule], [res({ kind: 'unresolved' })])
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(1)
  })

  it('passes a resource with no policy document', () => {
    const r = evaluate([principalRule], [res(undefined)])
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })
})

describe('evaluate (denyPublicPrincipal) — end-to-end through normalize', () => {
  it('flags a literal-JSON bucket policy with Principal "*"', () => {
    const publicPolicy = JSON.stringify({
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
          bad: [{ policy: publicPolicy }],
        },
      },
    }
    const resources = normalize(parsed, 'main.tf', '', undefined as never)
    const report = evaluate([principalRule], resources)
    expect(report.violations).toHaveLength(1)
    expect(report.couldNotEvaluate).toHaveLength(0)
  })

  it('passes a literal-JSON bucket policy with a specific Principal', () => {
    const scopedPolicy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: 'arn:aws:iam::123456789012:root' },
          Action: 's3:GetObject',
          Resource: 'arn:aws:s3:::b/*',
        },
      ],
    })
    const parsed = {
      resource: {
        aws_s3_bucket_policy: {
          good: [{ policy: scopedPolicy }],
        },
      },
    }
    const resources = normalize(parsed, 'main.tf', '', undefined as never)
    const report = evaluate([principalRule], resources)
    expect(report.violations).toHaveLength(0)
    expect(report.passed).toBe(1)
  })

  it('flags a jsonencode(...) bucket policy with Principal "*"', () => {
    const parsed = {
      resource: {
        aws_s3_bucket_policy: {
          encoded: [
            {
              policy:
                '${jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = "*", Action = "s3:GetObject", Resource = "*" }] })}',
            },
          ],
        },
      },
    }
    const resources = normalize(parsed, 'main.tf', '', undefined as never)
    const report = evaluate([principalRule], resources)
    expect(report.violations).toHaveLength(1)
  })

  it('passes a jsonencode(...) bucket policy with Principal { AWS = "*" } in a Deny', () => {
    // Principal { AWS = "*" } in a DENY is restrictive (deny everyone) — not public access.
    const parsed = {
      resource: {
        aws_s3_bucket_policy: {
          encoded: [
            {
              policy:
                '${jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Deny", Principal = { AWS = "*" }, Action = "s3:*", Resource = "*" }] })}',
            },
          ],
        },
      },
    }
    const resources = normalize(parsed, 'main.tf', '', undefined as never)
    const report = evaluate([principalRule], resources)
    expect(report.violations).toHaveLength(0)
    expect(report.passed).toBe(1)
  })
})
