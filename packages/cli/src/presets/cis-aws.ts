/**
 * CIS AWS Foundations — AWS-specific additions on top of `coreSecurity`.
 *
 * The shared controls (network exposure, encryption of RDS/EBS/EC2, IAM
 * least privilege, CloudTrail KMS + multi-region, no hardcoded secrets,
 * required tags, provisioner denial, backup retention ≥7) live in
 * `coreSecurity`. This pack adds only the AWS-specific CIS controls not
 * covered by the shared base.
 *
 * Usage:
 *   import { coreSecurity, cisAws } from '@dotzen/dotzen'
 *   export const spec = [...coreSecurity, ...cisAws, /* your rules *\/]
 *
 * To compose CIS + PCI (no duplicate violations):
 *   import { coreSecurity, cisAws, pciDss } from '@dotzen/dotzen'
 *   export const spec = [...coreSecurity, ...cisAws, ...pciDss]
 */
import { rule } from '../spec/rule'
import { AwsResource, AwsAttribute, Block, Effect } from '../vocabulary'

export const cisAws = [
  // ── CloudTrail log file validation (CIS §3.4 — not in core) ────────────
  rule()
    .resource(AwsResource.Cloudtrail)
    .mustBeTrue(AwsAttribute.EnableLogFileValidation)
    .message('CloudTrail must enable log file validation')
    .rationale('CIS AWS v1.4 §3.4 — log file integrity'),

  // ── Additional encryption-at-rest (CIS §3 — not in core) ───────────────
  rule()
    .resource(AwsResource.RedshiftCluster)
    .mustBeTrue(AwsAttribute.Encrypted)
    .message('Redshift clusters must be encrypted')
    .rationale('CIS AWS — encrypt Redshift at rest'),

  rule()
    .resource(AwsResource.ElasticacheReplicationGroup)
    .mustBeTrue(AwsAttribute.AtRestEncryptionEnabled)
    .message('ElastiCache replication groups must encrypt at rest')
    .rationale('CIS AWS — encrypt ElastiCache'),

  // ── S3 block public ACLs (CIS §2 — core has denyAcl, this adds the block) ─
  rule()
    .resource(AwsResource.S3Bucket)
    .mustBeTrue(AwsAttribute.BlockPublicAcls)
    .message('S3 buckets must block public ACLs')
    .rationale('CIS AWS — enable block_public_acls'),

  // ── RDS not publicly accessible (CIS §3 — not in core) ─────────────────
  rule()
    .resource(AwsResource.DbInstance)
    .mustBeFalse(AwsAttribute.PubliclyAccessible)
    .message('RDS instances must not be publicly accessible')
    .rationale('CIS AWS — no public DB endpoint'),

  // ── ECR image scanning (CIS — not in core) ─────────────────────────────
  rule()
    .resource(AwsResource.EcrRepository)
    .mustBeTrue(AwsAttribute.ImageScanOnPush)
    .message('ECR repositories must scan images on push')
    .rationale('CIS — supply-chain: scan on push'),

  // ── EKS node group: no direct SSH (use SSM Session Manager) ───────────
  rule()
    .id('eks-nodegroup-no-ssh')
    .resource(AwsResource.EksNodeGroup)
    .denyBlockPresence(Block.RemoteAccess)
    .message(
      'EKS node groups must not enable remote_access (use SSM Session Manager)',
    )
    .rationale('CIS AWS — no direct SSH to nodes; SSM provides audited access'),

  // ── S3 access logging (CIS §2.6 — not in core) ────────────────────────
  rule()
    .id('s3-access-logging')
    .resource(AwsResource.S3Bucket)
    .mustHaveAssociated(AwsResource.S3BucketLogging, AwsAttribute.Bucket)
    .onViolation(Effect.Warn)
    .message('S3 buckets must have access logging enabled')
    .rationale('CIS AWS §2.6 — log all access to S3 buckets'),

  // ── ALB access logging (CIS — not in core) ───────────────────────────
  rule()
    .id('alb-access-logging')
    .resource(AwsResource.Lb)
    .mustBeTrue(AwsAttribute.AccessLogsEnabled)
    .onViolation(Effect.Warn)
    .message('Load balancers must enable access logs')
    .rationale('CIS AWS — log all load balancer traffic for audit'),
] as const
