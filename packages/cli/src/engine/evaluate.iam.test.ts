import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { rule, Rule } from '../spec/rule'
import { NormalizedResource, PolicyInfo } from '../hcl/model'
import { AwsResource } from '../vocabulary'

const policyRule = (
  rule()
    .resource(AwsResource.IamPolicy)
    .denyIamWildcard()
    .message('IAM policies must not grant Action "*"')
    .validate(0) as { ok: true; value: Rule }
).value

const res = (policy?: PolicyInfo): NormalizedResource => ({
  type: AwsResource.IamPolicy,
  name: 'p',
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes: {},
  policy,
})

const parsed = (
  statements: {
    effect: string
    actions?: string[]
    resources?: string[]
    notActions?: string[]
  }[],
): PolicyInfo => ({
  kind: 'parsed',
  statements: statements.map((s) => ({
    effect: s.effect,
    actions: s.actions ?? [],
    resources: s.resources ?? [],
    notActions: s.notActions ?? [],
  })),
})

describe('evaluate (denyIamWildcard)', () => {
  it('flags an Allow statement granting Action "*"', () => {
    const r = evaluate(
      [policyRule],
      [res(parsed([{ effect: 'Allow', actions: ['*'], resources: ['*'] }]))],
    )
    expect(r.violations).toHaveLength(1)
  })

  it('passes a scoped Allow statement', () => {
    const r = evaluate(
      [policyRule],
      [
        res(
          parsed([
            { effect: 'Allow', actions: ['s3:GetObject'], resources: ['*'] },
          ]),
        ),
      ],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('does not flag a Deny statement with Action "*"', () => {
    const r = evaluate(
      [policyRule],
      [res(parsed([{ effect: 'Deny', actions: ['*'], resources: ['*'] }]))],
    )
    expect(r.violations).toHaveLength(0)
  })

  it('flags an Allow statement using NotAction (over-broad grant)', () => {
    const r = evaluate(
      [policyRule],
      [
        res(
          parsed([
            { effect: 'Allow', notActions: ['iam:*'], resources: ['*'] },
          ]),
        ),
      ],
    )
    expect(r.violations).toHaveLength(1)
  })

  it('could-not-evaluate for a jsonencode/var policy', () => {
    const r = evaluate([policyRule], [res({ kind: 'unresolved' })])
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(1)
  })

  it('passes a resource with no policy document', () => {
    expect(evaluate([policyRule], [res(undefined)]).violations).toHaveLength(0)
  })
})
