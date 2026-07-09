// Loaded at runtime via jiti. In a real consumer this imports from
// '@dotzen/dotzen'; the fixture points at the source for the slice.
import { rule, AwsResource, Port } from '../../../../../src/index'

export const spec = [
  rule()
    .resource(AwsResource.SecurityGroup)
    .denyIngress(Port.SSH, Port.RDP)
    .message('SSH and RDP must not be open to the internet')
    .rationale('CIS AWS Foundations Benchmark v1.4, control 5.2'),
]
