import { describe, it, expect } from 'vitest'
import { rule } from './rule'
import { AwsResource, Acl } from '../vocabulary'

describe('RuleBuilder.denyAcl', () => {
  it('produces a denyAcl condition', () => {
    const r = rule()
      .resource(AwsResource.S3Bucket)
      .denyAcl(Acl.PublicRead, Acl.PublicReadWrite)
      .message('no public buckets')
      .validate(0)
    expect(r.ok && r.value.conditions[0]).toEqual({
      kind: 'denyAcl',
      acls: [Acl.PublicRead, Acl.PublicReadWrite],
    })
  })
})
