import { rule } from '../../../../../src/index'

export const spec = [
  // #10: a secret-looking variable must be marked sensitive (else it leaks in
  // plans / CI logs — Terraform's own guidance).
  rule()
    .allResources()
    .denyInsensitiveVariable()
    .message('secret-looking variables must be marked sensitive'),
  // #12: a local must not hardcode a secret — use a reference (Secrets Manager
  // / SSM Parameter Store / Key Vault).
  rule()
    .allResources()
    .denyPlaintextLocalSecret()
    .message('locals must not hardcode secrets — use a reference'),
]