import { rule, AwsResource } from '@erkos/pluvian'

// No filesystem reachable from the public internet.
// pluvian's graph layer traces the full routing chain
// (mount target -> subnet -> route table -> internet gateway) —
// a multi-hop check per-resource tools cannot make.
export const spec = [
  rule()
    .resource(AwsResource.EfsMountTarget)
    .denyIfReachable(AwsResource.InternetGateway)
    .message('EFS mount targets must not be in a public subnet'),
]
