import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource } from '../hcl/model'
import { AwsResource, Port, Cidr, Effect } from '../vocabulary'

const denySsh: Rule = {
  id: 'no-public-ssh',
  target: { kind: 'resource', types: [AwsResource.SecurityGroup] },
  conditions: [
    { kind: 'denyIngress', ports: [Port.SSH], from: [Cidr.Internet] },
  ],
  effect: Effect.Block,
  message: 'SSH must not be open to the internet',
}

const lit = (v: string | number) => ({ kind: 'literal' as const, value: v })

describe('evaluate — ingress from other sources', () => {
  it('fires on a separate aws_vpc_security_group_ingress_rule resource', () => {
    const ruleRes: NormalizedResource = {
      type: AwsResource.VpcSecurityGroupIngressRule,
      name: 'ssh',
      file: 'main.tf',
      line: 1,
      ingress: [
        { fromPort: lit(22), toPort: lit(22), cidrBlocks: [lit('0.0.0.0/0')] },
      ],
      tags: { kind: 'resolved', keys: [] },
      attributes: {},
    }
    const report = evaluate([denySsh], [ruleRes])
    expect(report.violations).toHaveLength(1)
    expect(report.violations[0]?.resource).toBe(
      'aws_vpc_security_group_ingress_rule.ssh',
    )
  })

  it('reports couldNotEvaluate for a dynamic (unresolved) ingress', () => {
    const dyn: NormalizedResource = {
      type: AwsResource.SecurityGroup,
      name: 'dyn',
      file: 'main.tf',
      line: 1,
      ingress: [
        {
          fromPort: { kind: 'unresolved', expr: '${ingress.value.port}' },
          toPort: { kind: 'unresolved', expr: '${ingress.value.port}' },
          cidrBlocks: [{ kind: 'unresolved', expr: '${ingress.value.cidr}' }],
        },
      ],
      tags: { kind: 'resolved', keys: [] },
      attributes: {},
    }
    const report = evaluate([denySsh], [dyn])
    expect(report.violations).toHaveLength(0)
    expect(report.couldNotEvaluate).toHaveLength(1)
  })
})
