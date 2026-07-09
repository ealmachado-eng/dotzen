import { describe, it, expect } from 'vitest'
import { rule } from './rule'
import { AwsResource, Port, Cidr } from '../vocabulary'

describe('RuleBuilder additional surface', () => {
  it('resource(...) accepts multiple types', () => {
    const r = rule()
      .resource(AwsResource.SecurityGroup, AwsResource.DbInstance)
      .denyIngress(Port.SSH)
      .message('m')
      .validate(0)
    expect(r.ok && r.value.target).toEqual({
      kind: 'resource',
      types: [AwsResource.SecurityGroup, AwsResource.DbInstance],
    })
  })

  it('a rule with no resource() and no allResources() is invalid', () => {
    const r = rule().denyIngress(Port.SSH).message('m').validate(0)
    expect(r.ok).toBe(false)
  })

  it('allResources() targets every resource type', () => {
    const r = rule()
      .allResources()
      .denyIngress(Port.SSH)
      .message('all')
      .validate(0)
    expect(r.ok && r.value.target).toEqual({ kind: 'all' })
  })

  it('denyIngress defaults to both internet CIDRs', () => {
    const r = rule()
      .resource(AwsResource.SecurityGroup)
      .denyIngress(Port.SSH)
      .message('m')
      .validate(0)
    const c = r.ok ? r.value.conditions[0] : undefined
    expect(c?.kind).toBe('denyIngress')
    if (c?.kind === 'denyIngress') {
      expect(c.from).toEqual([Cidr.Internet, Cidr.InternetV6])
    }
  })

  it('carries an optional rationale through validation', () => {
    const r = rule()
      .resource(AwsResource.SecurityGroup)
      .denyIngress(Port.SSH)
      .message('m')
      .rationale('because')
      .validate(0)
    expect(r.ok && r.value.rationale).toBe('because')
  })
})
