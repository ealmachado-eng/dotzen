import { rule, AwsResource, AwsAttribute } from '../../../../../src/index'

export const spec = [
  // Scope stricter encryption to the DR-region provider only (alias "dr").
  // Default-provider instances are skipped by this rule.
  rule()
    .resource(AwsResource.Instance)
    .providerAlias('dr')
    .mustBeTrue(AwsAttribute.RootBlockDeviceEncrypted)
    .message('DR-region instances must encrypt the root volume'),
]