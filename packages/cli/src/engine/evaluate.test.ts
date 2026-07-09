import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource } from '../hcl/model'
import { AwsResource, Port, Cidr, Effect } from '../vocabulary'

const denySshRule: Rule = {
  id: 'no-public-ssh',
  target: { kind: 'resource', types: [AwsResource.SecurityGroup] },
  conditions: [
    { kind: 'denyIngress', ports: [Port.SSH], from: [Cidr.Internet] },
  ],
  effect: Effect.Block,
  message: 'SSH must not be open to the internet',
}

const sg = (
  name: string,
  ingress: NormalizedResource['ingress'],
): NormalizedResource => ({
  type: AwsResource.SecurityGroup,
  name,
  file: 'main.tf',
  line: 1,
  ingress,
  tags: { kind: 'resolved', keys: [] },
  attributes: {},
})

const lit = (v: string | number) => ({ kind: 'literal' as const, value: v })

describe('evaluate (denyIngress)', () => {
  it('flags SSH open to 0.0.0.0/0 as a violation', () => {
    const res = sg('web', [
      { fromPort: lit(22), toPort: lit(22), cidrBlocks: [lit('0.0.0.0/0')] },
    ])
    const report = evaluate([denySshRule], [res])
    expect(report.violations).toHaveLength(1)
    expect(report.violations[0]?.resource).toBe('aws_security_group.web')
    expect(report.couldNotEvaluate).toHaveLength(0)
    expect(report.passed).toBe(0)
  })

  it('passes when SSH is restricted to a private CIDR', () => {
    const res = sg('safe', [
      { fromPort: lit(22), toPort: lit(22), cidrBlocks: [lit('10.0.0.0/8')] },
    ])
    const report = evaluate([denySshRule], [res])
    expect(report.violations).toHaveLength(0)
    expect(report.passed).toBe(1)
  })

  it('passes when the open port is not a targeted port', () => {
    const res = sg('web', [
      { fromPort: lit(443), toPort: lit(443), cidrBlocks: [lit('0.0.0.0/0')] },
    ])
    expect(evaluate([denySshRule], [res]).violations).toHaveLength(0)
  })

  it('detects SSH inside a port range open to the internet', () => {
    const res = sg('range', [
      { fromPort: lit(20), toPort: lit(30), cidrBlocks: [lit('0.0.0.0/0')] },
    ])
    expect(evaluate([denySshRule], [res]).violations).toHaveLength(1)
  })

  it('reports couldNotEvaluate when the CIDR is an unresolved reference', () => {
    const res = sg('dyn', [
      {
        fromPort: lit(22),
        toPort: lit(22),
        cidrBlocks: [{ kind: 'unresolved', expr: 'var.allowed' }],
      },
    ])
    const report = evaluate([denySshRule], [res])
    expect(report.violations).toHaveLength(0)
    expect(report.couldNotEvaluate).toHaveLength(1)
    expect(report.couldNotEvaluate[0]?.reason).toMatch(/unresolved/i)
  })

  it('ignores resources the rule does not target', () => {
    const res: NormalizedResource = {
      type: AwsResource.S3Bucket,
      name: 'b',
      file: 'main.tf',
      line: 1,
      ingress: [],
      tags: { kind: 'resolved', keys: [] },
      attributes: {},
    }
    const report = evaluate([denySshRule], [res])
    expect(report.violations).toHaveLength(0)
    expect(report.passed).toBe(0)
  })
})
