import { rule, AwsResource } from '../../../../../src/index'

export const spec = [
  rule()
    .resource(AwsResource.IamPolicy)
    .denyIamWildcard()
    .message('IAM policies must not grant Action "*" on Resource "*"')
    .rationale('CIS AWS Foundations Benchmark — full administrative access'),

  rule()
    .resource(AwsResource.EcsTaskDefinition)
    .denyPrivilegedContainers()
    .message('ECS containers must not be privileged')
    .rationale('Privileged containers bypass container isolation'),
]
