import { rule, AwsResource, AwsAttribute } from '../../../../../src/index'

export const spec = [
  // #13: a module call's `providers = { aws = aws.dr }` remaps the child's
  // default-provider resources to the dr alias. This dr-scoped rule then
  // fires on a child resource that has NO explicit `provider` arg — proving
  // the remap threads the alias across the module boundary (closes #9).
  rule()
    .resource(AwsResource.Instance)
    .providerAlias('dr')
    .mustBeTrue(AwsAttribute.RootBlockDeviceEncrypted)
    .message('DR-aliased instances (incl. remapped modules) must encrypt root volume'),
]