/**
 * NIST SP 800-53 Rev. 5 — additions on top of `coreSecurity`.
 *
 * NIST adds: IAM password policy (AC-1, IA-5), encryption-at-rest for
 * additional resource types (SC-28), no drift hiding on security attrs
 * (CM-3), and version pinning for config management (CM-7).
 *
 * Usage:
 *   import { coreSecurity, nist80053 } from '@erkos/pluvian'
 *   export const spec = [...coreSecurity, ...nist80053]
 */
import { rule } from '../spec/rule'
import { AwsResource, AwsAttribute } from '../vocabulary'

export const nist80053 = [
  // ── IAM password policy (NIST IA-5, AC-1) ──────────────────────────────
  rule()
    .resource(AwsResource.IamAccountPasswordPolicy)
    .mustBeAtLeast(AwsAttribute.MinimumPasswordLength, 14)
    .message(
      'IAM password policy: minimum length must be at least 14 characters',
    )
    .rationale('NIST IA-5(1) — minimum password length'),

  rule()
    .resource(AwsResource.IamAccountPasswordPolicy)
    .mustBeTrue(AwsAttribute.RequireSymbols)
    .message('IAM password policy must require symbols')
    .rationale('NIST IA-5(1) — password complexity'),

  rule()
    .resource(AwsResource.IamAccountPasswordPolicy)
    .mustBeTrue(AwsAttribute.RequireNumbers)
    .message('IAM password policy must require numbers')
    .rationale('NIST IA-5(1) — password complexity'),

  rule()
    .resource(AwsResource.IamAccountPasswordPolicy)
    .mustBeTrue(AwsAttribute.RequireUppercaseCharacters)
    .message('IAM password policy must require uppercase characters')
    .rationale('NIST IA-5(1) — password complexity'),

  rule()
    .resource(AwsResource.IamAccountPasswordPolicy)
    .mustBeTrue(AwsAttribute.RequireLowercaseCharacters)
    .message('IAM password policy must require lowercase characters')
    .rationale('NIST IA-5(1) — password complexity'),

  rule()
    .resource(AwsResource.IamAccountPasswordPolicy)
    .mustBeAtLeast(AwsAttribute.PasswordReusePrevention, 5)
    .message('IAM password policy must prevent reuse of at least 5 passwords')
    .rationale('NIST IA-5(1) — password history'),

  rule()
    .resource(AwsResource.IamAccountPasswordPolicy)
    .mustBeAtMost(AwsAttribute.MaxPasswordAge, 90)
    .message('IAM password policy: max password age must be at most 90 days')
    .rationale('NIST IA-5(1) — password expiration'),

  // ── Additional encryption-at-rest (NIST SC-28) ─────────────────────────
  rule()
    .resource(AwsResource.RedshiftCluster)
    .mustBeTrue(AwsAttribute.Encrypted)
    .message('Redshift clusters must be encrypted')
    .rationale('NIST SC-28 — protect information at rest'),

  rule()
    .resource(AwsResource.DynamodbTable)
    .mustBeTrue(AwsAttribute.PointInTimeRecoveryEnabled)
    .message('DynamoDB tables must enable point-in-time recovery')
    .rationale('NIST CP-9 — information system backup'),

  // ── Configuration management: no drift hiding (NIST CM-3) ──────────────
  rule()
    .resource(AwsResource.S3Bucket)
    .denyIgnoreChanges('tags', 'acl', 'server_side_encryption')
    .message('Must not hide drift on security attrs via ignore_changes')
    .rationale('NIST CM-3 — changes to security configs must be auditable'),

  rule()
    .resource(AwsResource.DbInstance)
    .denyIgnoreChanges(
      'storage_encrypted',
      'deletion_protection',
      'master_password',
    )
    .message('Must not hide drift on DB security attrs via ignore_changes')
    .rationale('NIST CM-3 — changes to security configs must be auditable'),

  // ── Config management: version pinning (NIST CM-7) ─────────────────────
  rule()
    .allResources()
    .requireExactTerraformVersion()
    .message('Terraform required_version must be an exact pin (NIST CM-7)')
    .rationale(
      'NIST CM-7 — restrict software installation to approved versions',
    ),

  // ── State encryption (NIST SC-28) ──────────────────────────────────────
  rule()
    .allResources()
    .requireEncryptedBackend()
    .message(
      'State backend must be encrypted (NIST SC-28 — protect state at rest)',
    )
    .rationale('NIST SC-28 — state files may contain sensitive configuration'),
] as const
