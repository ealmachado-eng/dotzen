import { rule, DataResource, DataAttribute } from '../../../../../src/index'

export const spec = [
  // An AMI data source with no `owners` (or owners that omit the org account)
  // could select a third-party AMI — a supply-chain risk. Require `owners` to
  // include the org's own account ("self").
  rule()
    .resource(DataResource.AwsAmi)
    .listMustInclude(DataAttribute.AmiOwners, 'self')
    .message('AMI data sources must pin owners and include the org account'),
]