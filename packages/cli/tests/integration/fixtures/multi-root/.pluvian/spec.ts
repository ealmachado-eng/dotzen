import { rule, AwsResource, Port } from '../../../../../src/index'

export const spec = [
  rule()
    .resource(AwsResource.SecurityGroup)
    .denyIngress(Port.SSH)
    .message('SSH must not be open to the internet'),
]
