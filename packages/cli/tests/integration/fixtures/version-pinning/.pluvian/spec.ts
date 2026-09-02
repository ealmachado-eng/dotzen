import { rule } from '../../../../../src/index'

export const spec = [
  // #11: the TF engine version must be EXACT-pinned (`= X.Y.Z`). A floating
  // constraint lets `terraform init` pull a different engine → drift.
  rule()
    .allResources()
    .requireExactTerraformVersion()
    .message('terraform required_version must be an exact pin (= X.Y.Z)'),
  // #11: the aws + google providers must be version-pinned (`=` or `~>` —
  // both block a major-version drift). Floating/absent → flagged.
  rule()
    .allResources()
    .denyFloatingProviderVersion('aws', 'google')
    .message('providers must be version-pinned (= or ~>)'),
]