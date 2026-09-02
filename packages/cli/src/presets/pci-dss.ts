/**
 * PCI DSS — additions on top of `coreSecurity` (#composable presets).
 *
 * PCI DSS v4.0 adds: encrypt ALL resources at rest (not just RDS), all four
 * S3 public-access-block flags, stricter backup retention (≥30 days),
 * encrypted + non-local state, DynamoDB point-in-time recovery, and no
 * public DB endpoints.
 *
 * Usage:
 *   import { coreSecurity, pciDss } from '@erkos/pluvian'
 *   export const spec = [...coreSecurity, ...pciDss]
 */
import { rule } from '../spec/rule'
import { AwsResource, AwsAttribute } from '../vocabulary'

export const pciDss = [
  // ── Encrypt ALL resources at rest (PCI 3.4 — broader than core) ────────
  rule()
    .resource(AwsResource.RedshiftCluster)
    .mustBeTrue(AwsAttribute.Encrypted)
    .message('Redshift clusters must be encrypted')
    .rationale('PCI 3.4 — render PAN unreadable anywhere stored'),

  rule()
    .resource(AwsResource.EfsFileSystem)
    .mustBeTrue(AwsAttribute.Encrypted)
    .message('EFS file systems must be encrypted')
    .rationale('PCI 3.4 — encrypt all cardholder data storage'),

  rule()
    .resource(AwsResource.ElasticacheReplicationGroup)
    .mustBeTrue(AwsAttribute.AtRestEncryptionEnabled)
    .message('ElastiCache replication groups must encrypt at rest')
    .rationale('PCI 3.4 — encrypt all data stores'),

  rule()
    .resource(AwsResource.DynamodbTable)
    .mustBeTrue(AwsAttribute.PointInTimeRecoveryEnabled)
    .message('DynamoDB tables must enable point-in-time recovery')
    .rationale('PCI 3.4 — recoverability of stored data'),

  // ── S3 public access — ALL four block flags (PCI 1.3.4) ────────────────
  rule()
    .resource(AwsResource.S3BucketPublicAccessBlock)
    .mustBeTrue(AwsAttribute.BlockPublicAcls)
    .message('S3 buckets must block public ACLs')
    .rationale('PCI 1.3.4 — restrict inbound to cardholder environment'),

  rule()
    .resource(AwsResource.S3BucketPublicAccessBlock)
    .mustBeTrue(AwsAttribute.BlockPublicPolicy)
    .message('S3 buckets must block public policies')
    .rationale('PCI 1.3.4 — no public bucket policies'),

  rule()
    .resource(AwsResource.S3BucketPublicAccessBlock)
    .mustBeTrue(AwsAttribute.IgnorePublicAcls)
    .message('S3 buckets must ignore public ACLs')
    .rationale('PCI 1.3.4 — disregard public ACLs on existing objects'),

  rule()
    .resource(AwsResource.S3BucketPublicAccessBlock)
    .mustBeTrue(AwsAttribute.RestrictPublicBuckets)
    .message('S3 buckets must restrict public buckets')
    .rationale('PCI 1.3.4 — restrict cross-account public access'),

  // ── Stricter backup retention (PCI 10.7 — 1 year) ──────────────────────
  // Aurora clusters (`aws_rds_cluster`) carry `backup_retention_period` too.
  rule()
    .resource(AwsResource.DbInstance, AwsResource.RdsCluster)
    .mustBeAtLeast(AwsAttribute.BackupRetentionPeriod, 30)
    .message(
      'RDS/Aurora backup retention must be at least 30 days (PCI audit trail)',
    )
    .rationale('PCI 10.7 — retain audit trail history for at least 1 year'),

  // ── RDS/Aurora/DocDB not publicly accessible (PCI 1.3.1) ────────────────
  rule()
    .resource(
      AwsResource.DbInstance,
      AwsResource.RdsClusterInstance,
      AwsResource.DocdbClusterInstance,
    )
    .mustBeFalse(AwsAttribute.PubliclyAccessible)
    .message('RDS/Aurora/DocDB instances must not be publicly accessible')
    .rationale('PCI 1.3.1 — limit cardholder data to need-to-know'),

  // ── No drift hiding on security attrs (PCI 6.5) ────────────────────────
  rule()
    .resource(AwsResource.S3Bucket)
    .denyIgnoreChanges('tags', 'acl', 'server_side_encryption')
    .message(
      'Must not hide drift on security-critical attrs via ignore_changes',
    )
    .rationale('PCI 6.5 — security configurations must be auditable'),

  // ── Encrypted + non-local state (PCI 3.4, 10.5) ────────────────────────
  rule()
    .allResources()
    .requireEncryptedBackend()
    .message(
      'State backend must be encrypted (PCI 3.4 — protect cardholder data in state)',
    )
    .rationale('PCI 3.4 — state files may contain PAN / secrets'),

  rule()
    .allResources()
    .denyLocalBackend()
    .message(
      'Local state is forbidden under PCI — use a remote encrypted backend',
    )
    .rationale('PCI 10.5 — audit trail integrity requires centralized state'),
] as const
