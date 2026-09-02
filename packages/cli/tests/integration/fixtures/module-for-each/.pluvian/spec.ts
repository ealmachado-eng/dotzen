import { rule, AwsResource, Port } from '../../../../../src/index'

export const spec = [
  rule()
    .resource(AwsResource.SecurityGroup)
    .denyIngress(Port.Postgres)
    .message('DB port must not be open to the internet'),
]