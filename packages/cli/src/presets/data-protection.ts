/**
 * Data protection (GDPR / LGPD) — additions on top of `coreSecurity`.
 *
 * GDPR (EU) and LGPD (Brazil) share the same Terraform-relevant controls:
 * encrypt ALL data stores at rest (Art. 32), prevent public exposure of
 * personal data, tag resources with a data-classification label, and
 * protect state (which may contain personal data). Data-residency (keep
 * data in the EU/region) is NOT expressible in dotzen today — see the
 * documented gap below.
 *
 * Usage:
 *   import { coreSecurity, dataProtection } from '@dotzen/dotzen'
 *   export const spec = [...coreSecurity, ...dataProtection]
 *
 * NOTE: the data-class tag key is org-defined. Replace 'data_classification'
 * with your own enum to get compile-time safety:
 *   enum DataClass { Classification = 'data_classification', Subject = 'data_subject' }
 *   rule().resource(...).mustHaveTags(DataClass.Classification)
 */
import { rule } from '../spec/rule'
import { AwsResource, AwsAttribute, Effect } from '../vocabulary'

/** A data-classification tag key — org-defined (replace with your own enum). */
const DataClassificationTag = 'data_classification'

export const dataProtection = [
  // ── Encrypt ALL data stores (GDPR Art. 32, LGPD Art. 46) ───────────────
  rule()
    .resource(AwsResource.RedshiftCluster)
    .mustBeTrue(AwsAttribute.Encrypted)
    .message(
      'Redshift clusters must be encrypted (GDPR Art. 32 — data protection)',
    )
    .rationale('GDPR Art. 32 / LGPD Art. 46 — encrypt personal data at rest'),

  rule()
    .resource(AwsResource.EfsFileSystem)
    .mustBeTrue(AwsAttribute.Encrypted)
    .message('EFS file systems must be encrypted (GDPR Art. 32)')
    .rationale('GDPR Art. 32 — encrypt personal data at rest'),

  rule()
    .resource(AwsResource.ElasticacheReplicationGroup)
    .mustBeTrue(AwsAttribute.AtRestEncryptionEnabled)
    .message('ElastiCache must encrypt at rest (GDPR Art. 32)')
    .rationale('GDPR Art. 32 — encrypt personal data at rest'),

  rule()
    .resource(AwsResource.DynamodbTable)
    .mustBeTrue(AwsAttribute.PointInTimeRecoveryEnabled)
    .message(
      'DynamoDB tables must enable point-in-time recovery (GDPR Art. 32 — availability)',
    )
    .rationale(
      'GDPR Art. 32(1)(c) — ensure ongoing availability of personal data',
    ),

  // ── Prevent public exposure of personal data (GDPR Art. 5(1)(f)) ───────
  rule()
    .resource(AwsResource.S3BucketPublicAccessBlock)
    .mustBeTrue(AwsAttribute.BlockPublicAcls)
    .message(
      'S3 buckets must block public ACLs (GDPR Art. 5(1)(f) — prevent unauthorized access)',
    )
    .rationale(
      'GDPR Art. 5(1)(f) — prevent unlawful processing / public exposure',
    ),

  rule()
    .resource(AwsResource.S3BucketPublicAccessBlock)
    .mustBeTrue(AwsAttribute.BlockPublicPolicy)
    .message('S3 buckets must block public policies (GDPR Art. 5(1)(f))')
    .rationale('GDPR Art. 5(1)(f) — no public bucket policies'),

  rule()
    .resource(
      AwsResource.DbInstance,
      AwsResource.RdsClusterInstance,
      AwsResource.DocdbClusterInstance,
    )
    .mustBeFalse(AwsAttribute.PubliclyAccessible)
    .message(
      'RDS/Aurora/DocDB must not be publicly accessible (GDPR Art. 5(1)(f))',
    )
    .rationale('GDPR Art. 5(1)(f) — restrict access to personal data'),

  // ── Data-classification tagging (GDPR Art. 30 — records of processing) ─
  rule()
    .resource(
      AwsResource.DbInstance,
      AwsResource.S3Bucket,
      AwsResource.DynamodbTable,
      AwsResource.RedshiftCluster,
    )
    .mustHaveTags(DataClassificationTag)
    .message('Data stores must carry a data_classification tag (GDPR Art. 30)')
    .rationale(
      'GDPR Art. 30 / LGPD Art. 37 — records of processing activities',
    ),

  // ── Protect state (GDPR Art. 32 — state may contain personal data) ─────
  rule()
    .allResources()
    .requireEncryptedBackend()
    .message(
      'State backend must be encrypted (GDPR Art. 32 — state may contain personal data)',
    )
    .rationale('GDPR Art. 32 — state files may contain personal data'),

  rule()
    .allResources()
    .denyLocalBackend()
    .message(
      'Local state is forbidden under GDPR/LGPD — use a remote encrypted backend',
    )
    .rationale(
      'GDPR Art. 32 — centralized, encrypted state for data protection',
    ),

  // ── No drift hiding on data-protection attrs ───────────────────────────
  rule()
    .resource(AwsResource.S3Bucket)
    .denyIgnoreChanges('tags', 'acl', 'server_side_encryption')
    .message('Must not hide drift on data-protection attrs via ignore_changes')
    .rationale('GDPR Art. 32 — security configurations must be auditable'),

  // ── Data residency (GDPR Art. 44 / LGPD Art. 11) ──────────────────────
  // The `denyNonApprovedRegion` condition is region-agnostic — it flags any
  // resource whose provider region is NOT in the approved list. Tailor the
  // region list to your jurisdiction. Two examples (uncomment one or both):

  // GDPR — personal data must stay in EU regions (AWS + GCP EU regions).
  // rule()
  //   .allResources()
  //   .denyNonApprovedRegion(
  //     'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
  //     'europe-west1', 'europe-west2', 'europe-west3', 'europe-west4',
  //     'europe-west6', 'europe-central2', 'europe-north1',
  //   )
  //   .message('Personal data must not leave EU regions (GDPR Art. 44)')
  //   .rationale('GDPR Art. 44 — prohibit transfers of personal data outside the EU'),

  // LGPD — personal data of Brazilian data subjects must stay in Brazil
  // (AWS sa-east-1 São Paulo, GCP southamerica-east1).
  // rule()
  //   .allResources()
  //   .denyNonApprovedRegion('sa-east-1', 'southamerica-east1')
  //   .message('Dados pessoais devem permanecer em regiões brasileiras (LGPD Art. 11)')
  //   .rationale('LGPD Art. 11 — dados pessoais de titulares brasileiros devem ser processados no Brasil'),

  // ── Graph-layer rule (doc 10): KMS key provenance ─────────────────────
  // The graph traverses bucket → kms_key and checks key_manager. AWS-managed
  // keys ARE encrypted-at-rest; this rule is for orgs that require full key
  // control (rotation, access policies, audit trail).
  rule()
    .id('no-aws-managed-kms')
    .resource(AwsResource.S3Bucket)
    .denyIfReachableAttr(AwsResource.KmsKey, AwsAttribute.KeyManager, 'AWS')
    .onViolation(Effect.Warn)
    .message(
      'Buckets should use customer-managed KMS keys, not AWS-managed defaults',
    )
    .rationale(
      'Customer-managed keys give full control over key rotation, access ' +
        'policies, and audit trail — required for GDPR Art. 32 / PCI 3.6',
    ),
] as const
