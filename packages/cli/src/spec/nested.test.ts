import { describe, it, expect } from 'vitest'
import { rule } from './rule'
import { AwsResource, AwsAttribute, HttpTokens } from '../vocabulary'

describe('RuleBuilder — mustEqual / mustBeAtLeast / mustBeAtMost', () => {
  it('mustEqual produces a mustEqual condition', () => {
    const r = rule()
      .resource(AwsResource.Instance)
      .mustEqual(AwsAttribute.HttpTokens, HttpTokens.Required)
      .message('imdsv2')
      .validate(0)
    expect(r.ok && r.value.conditions[0]).toEqual({
      kind: 'mustEqual',
      attr: 'metadata_options.http_tokens',
      value: 'required',
    })
  })

  it('mustBeAtLeast produces a mustBeAtLeast condition', () => {
    const r = rule()
      .resource(AwsResource.DbInstance)
      .mustBeAtLeast(AwsAttribute.BackupRetentionPeriod, 7)
      .message('backups')
      .validate(0)
    expect(r.ok && r.value.conditions[0]).toEqual({
      kind: 'mustBeAtLeast',
      attr: 'backup_retention_period',
      min: 7,
    })
  })

  it('mustBeAtMost produces a mustBeAtMost condition', () => {
    const r = rule()
      .resource(AwsResource.IamAccountPasswordPolicy)
      .mustBeAtMost(AwsAttribute.MaxPasswordAge, 90)
      .message('password expiry')
      .validate(0)
    expect(r.ok && r.value.conditions[0]).toEqual({
      kind: 'mustBeAtMost',
      attr: 'max_password_age',
      max: 90,
    })
  })
})
