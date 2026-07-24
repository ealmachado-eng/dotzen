import { rule } from '../../../../../src/index'

export const spec = [
  // #17: state must live in an encrypted, remote backend. A local/absent
  // backend → unencrypted, unshared, unlocked state (catastrophic leak risk).
  rule()
    .allResources()
    .requireEncryptedBackend()
    .message('state backend must be declared and encrypted'),
  rule()
    .allResources()
    .denyLocalBackend()
    .message('local state is forbidden — use a remote backend'),
]