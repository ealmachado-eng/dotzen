import {
  rule,
  AwsResource,
  AwsAttribute,
  Environment,
} from '../../../../../src/index'

export const spec = [
  // Production-only: applies only to resources in a root mapped to
  // production (folder-driven — the resources carry no environment tag).
  rule()
    .resource(AwsResource.DbInstance)
    .environment(Environment.Production)
    .mustBeTrue(AwsAttribute.StorageEncrypted)
    .message('Production RDS must have storage encryption at rest'),
]
