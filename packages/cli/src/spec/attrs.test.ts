import { describe, it, expect } from 'vitest'
import { rule } from './rule'
import { AwsResource, AwsAttribute } from '../vocabulary'

describe('RuleBuilder attribute conditions', () => {
  it('mustBeTrue produces a mustBeTrue condition', () => {
    const r = rule()
      .resource(AwsResource.DbInstance)
      .mustBeTrue(
        AwsAttribute.StorageEncrypted,
        AwsAttribute.DeletionProtection,
      )
      .message('m')
      .validate(0)
    expect(r.ok && r.value.conditions[0]).toEqual({
      kind: 'mustBeTrue',
      attrs: [AwsAttribute.StorageEncrypted, AwsAttribute.DeletionProtection],
    })
  })

  it('denyWhenTrue produces a denyWhenTrue condition', () => {
    const r = rule()
      .resource(AwsResource.DbInstance)
      .denyWhenTrue(AwsAttribute.PubliclyAccessible)
      .message('m')
      .validate(0)
    expect(r.ok && r.value.conditions[0]).toEqual({
      kind: 'denyWhenTrue',
      attrs: [AwsAttribute.PubliclyAccessible],
    })
  })
})
