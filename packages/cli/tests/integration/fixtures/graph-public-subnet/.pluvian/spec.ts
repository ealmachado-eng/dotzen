import { rule, AwsResource } from '@erkos/pluvian'

export const spec = [
  // Graph-layer rule (doc 10): no DB in a public subnet.
  rule()
    .resource(AwsResource.DbInstance)
    .denyIfReachable(AwsResource.InternetGateway)
    .message('DB must not be in a public subnet (reachable to an Internet Gateway)'),
]
