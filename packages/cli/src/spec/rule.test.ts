import { describe, it, expect } from 'vitest'
import { rule } from './rule'
import { AwsResource, Port, Cidr, Effect } from '../vocabulary'

describe('RuleBuilder.validate', () => {
  it('produces a normalized Rule for a complete rule', () => {
    const r = rule()
      .resource(AwsResource.SecurityGroup)
      .denyIngress(Port.SSH, Port.RDP)
      .message('no public ssh/rdp')
      .validate(0)

    expect(r).toEqual({
      ok: true,
      value: {
        id: 'rule-1',
        target: { kind: 'resource', types: [AwsResource.SecurityGroup] },
        conditions: [
          {
            kind: 'denyIngress',
            ports: [Port.SSH, Port.RDP],
            from: [Cidr.Internet, Cidr.InternetV6],
          },
        ],
        effect: Effect.Block,
        message: 'no public ssh/rdp',
        rationale: undefined,
      },
    })
  })

  it('accumulates all problems for an incomplete rule', () => {
    const r = rule().validate(2)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const problems = r.error.map((e) => e.problem)
      expect(problems).toContain('missing .message()')
      expect(problems).toContain('missing .resource() or .allResources()')
      expect(problems).toContain('no conditions')
      expect(r.error.every((e) => e.ruleIndex === 2)).toBe(true)
    }
  })

  it('honors an explicit effect override', () => {
    const r = rule()
      .resource(AwsResource.SecurityGroup)
      .denyIngress(Port.SSH)
      .onViolation(Effect.Warn)
      .message('warn only')
      .validate(0)
    expect(r.ok && r.value.effect).toBe(Effect.Warn)
  })
})
