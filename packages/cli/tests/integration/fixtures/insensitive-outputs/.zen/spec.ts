import { rule } from '../../../../../src/index'

// Secret-bearing attributes that must never appear in an UNSAFE output.
// Full `type.attr` (resource name wildcarded) — matches any instance.
enum SecretAttr {
  DbPassword = 'aws_db_instance.master_password',
}

export const spec = [
  // An output referencing a secret attribute without `sensitive = true` leaks
  // it in state / CI logs. The rule flags the leak; a sensitive=the output
  // passes; a non-secret output passes.
  rule()
    .allResources()
    .denyInsensitiveSecretOutput(SecretAttr.DbPassword)
    .message('secret outputs must set sensitive = true'),
]