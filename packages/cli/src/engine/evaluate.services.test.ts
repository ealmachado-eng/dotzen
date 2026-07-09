import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
import { AwsResource, AwsAttribute, Effect } from '../vocabulary'

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

const boolLit = (v: boolean): NormalizedValue => ({ kind: 'literal', value: v })

// EKS: endpoint_public_access defaults to TRUE, so absent must violate.
const eksPrivate: Rule = {
  id: 'eks-private',
  target: { kind: 'resource', types: [AwsResource.EksCluster] },
  conditions: [
    { kind: 'mustBeFalse', attrs: [AwsAttribute.EndpointPublicAccess] },
  ],
  effect: Effect.Block,
  message: 'EKS endpoint must not be public',
}

describe('evaluate (mustBeFalse — default-true attributes)', () => {
  it('passes when explicitly false', () => {
    const r = evaluate(
      [eksPrivate],
      [
        res(AwsResource.EksCluster, {
          'vpc_config.endpoint_public_access': boolLit(false),
        }),
      ],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('flags when explicitly true', () => {
    const r = evaluate(
      [eksPrivate],
      [
        res(AwsResource.EksCluster, {
          'vpc_config.endpoint_public_access': boolLit(true),
        }),
      ],
    )
    expect(r.violations).toHaveLength(1)
  })

  it('flags when absent (default is public) — never a silent pass', () => {
    expect(
      evaluate([eksPrivate], [res(AwsResource.EksCluster, {})]).violations,
    ).toHaveLength(1)
  })

  it('could-not-evaluate when unresolved', () => {
    const r = evaluate(
      [eksPrivate],
      [
        res(AwsResource.EksCluster, {
          'vpc_config.endpoint_public_access': {
            kind: 'unresolved',
            expr: '${var.p}',
          },
        }),
      ],
    )
    expect(r.couldNotEvaluate).toHaveLength(1)
  })
})

describe('evaluate — ECS/ALB service checks (reuse existing conditions)', () => {
  it('flags an ECS service that assigns a public IP', () => {
    const rule: Rule = {
      id: 'ecs-no-public-ip',
      target: { kind: 'resource', types: [AwsResource.EcsService] },
      conditions: [
        { kind: 'denyWhenTrue', attrs: [AwsAttribute.AssignPublicIp] },
      ],
      effect: Effect.Block,
      message: 'no public IP',
    }
    const r = evaluate(
      [rule],
      [
        res(AwsResource.EcsService, {
          'network_configuration.assign_public_ip': boolLit(true),
        }),
      ],
    )
    expect(r.violations).toHaveLength(1)
  })

  it('flags an ALB with access logging disabled/absent', () => {
    const rule: Rule = {
      id: 'alb-logs',
      target: { kind: 'resource', types: [AwsResource.Lb] },
      conditions: [
        { kind: 'mustBeTrue', attrs: [AwsAttribute.AccessLogsEnabled] },
      ],
      effect: Effect.Block,
      message: 'access logs required',
    }
    // absent -> mustBeTrue violates (logging off by default)
    expect(evaluate([rule], [res(AwsResource.Lb, {})]).violations).toHaveLength(
      1,
    )
    expect(
      evaluate(
        [rule],
        [res(AwsResource.Lb, { 'access_logs.enabled': boolLit(true) })],
      ).violations,
    ).toHaveLength(0)
  })
})
