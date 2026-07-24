import { rule, AwsResource } from '../../../../../src/index'

export const spec = [
  // #18: a `connection {}` block (used by file/remote-exec provisioners)
  // must not hardcode a secret (private_key/password/token). Use a reference
  // (Secrets Manager / SSM) or a runtime file read.
  rule()
    .resource(AwsResource.Instance)
    .denyPlaintextConnectionSecret()
    .message('connection blocks must not hardcode secrets — use a reference'),
]