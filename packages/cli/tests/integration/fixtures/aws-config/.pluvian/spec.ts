import { rule, AwsResource, AwsAttribute } from '../../../../../src/index'

export const spec = [
  rule()
    .resource(AwsResource.ConfigConfigurationRecorder)
    .mustBeTrue(AwsAttribute.RecordingGroupAllSupported)
    .message('AWS Config must record all supported resource types')
    .rationale('CIS AWS §3.1 — Config should cover all resource types'),

  rule()
    .resource(AwsResource.ConfigConfigurationRecorder)
    .mustBeTrue(AwsAttribute.RecordingGroupIncludeGlobalResourceTypes)
    .message('AWS Config must include global resource types (IAM)')
    .rationale('CIS AWS §3.2 — Config should record global resources'),
]
