import { describe, it, expect } from 'vitest'
import { rule } from './rule'
import { AwsResource, AwsAttribute, Effect, Approver } from '../vocabulary'

describe('RuleBuilder — effect + approvers', () => {
  it('carries onViolation(RequireApproval) and approvers into the rule', () => {
    const r = rule()
      .resource(AwsResource.DbInstance)
      .denyWhenTrue(AwsAttribute.PubliclyAccessible)
      .onViolation(Effect.RequireApproval)
      .approvers(Approver.PlatformTeam, Approver.FinOps)
      .message('needs sign-off')
      .validate(0)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.effect).toBe(Effect.RequireApproval)
      expect(r.value.approvers).toEqual([
        Approver.PlatformTeam,
        Approver.FinOps,
      ])
    }
  })

  it('leaves approvers undefined when none are set', () => {
    const r = rule()
      .resource(AwsResource.DbInstance)
      .denyWhenTrue(AwsAttribute.PubliclyAccessible)
      .message('m')
      .validate(0)
    expect(r.ok && r.value.approvers).toBeUndefined()
  })
})
