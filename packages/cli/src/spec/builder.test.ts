import { describe, it, expect } from 'vitest'
import { rule } from './rule'
import { AwsResource, Port, Cidr, Tag } from '../vocabulary'

// A consumer's own tag taxonomy — the recommended way to express
// org-specific tag keys (typo-safe, no bare strings).
enum OrgTag {
  ApmId = 'apm_id',
  CmdbAppId = 'cmdb_app_id',
}

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

  it('mustHaveTags accepts a self-built org enum mixed with built-in Tag', () => {
    const r = rule()
      .resource(AwsResource.S3Bucket)
      .mustHaveTags(OrgTag.ApmId, OrgTag.CmdbAppId, Tag.Environment)
      .message('org tags')
      .validate(0)
    const c = r.ok ? r.value.conditions[0] : undefined
    expect(c?.kind).toBe('mustHaveTags')
    if (c?.kind === 'mustHaveTags')
      expect(c.tags).toEqual(['apm_id', 'cmdb_app_id', 'environment'])
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
