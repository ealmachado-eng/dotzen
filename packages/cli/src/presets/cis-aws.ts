/**
 * CIS AWS Foundations Benchmark — curated starter preset (#24).
 *
 * A shipped `Rule[]` covering the high-impact CIS AWS controls: network
 * exposure, encryption-at-rest, IAM least-privilege, audit logging, and
 * resource hygiene. Users extend or tighten — this is a STARTER, not
 * exhaustive. Each rule cites the CIS control it maps to.
 *
 * Usage (from a .zen/spec.ts):
 *   import { cisAws } from '@dotzen/dotzen'
 *   export const spec = [...cisAws, /* your custom rules *\/]
 *
 * All rules use `Effect.Block` (the default) — a violation fails the build.
 * Override with `.onViolation(Effect.Warn)` for advisory rules.
 */
import { rule } from '../spec/rule'
import {
  AwsResource,
  AwsAttribute,
  Port,
  Tag,
  Acl,
  Provisioner,
} from '../vocabulary'

export const cisAws = [
  // ── Network exposure (CIS §5) ──────────────────────────────────────────
  rule()
    .resource(AwsResource.SecurityGroup)
    .denyIngress(Port.SSH, Port.RDP)
    .message('SSH and RDP must not be open to the internet')
    .rationale('CIS AWS v1.4 §5.2 — no public SSH/RDP'),

  rule()
    .resource(AwsResource.SecurityGroup)
    .denyIngress(Port.Postgres, Port.MySQL)
    .message('Database ports must not be open to the internet')
    .rationale('CIS AWS — restrict DB ingress'),

  // ── Encryption at rest (CIS §1, §3) ────────────────────────────────────
  rule()
    .resource(AwsResource.DbInstance)
    .mustBeTrue(AwsAttribute.StorageEncrypted)
    .message('RDS instances must encrypt storage at rest')
    .rationale('CIS AWS v1.4 §3.3'),

  rule()
    .resource(AwsResource.EbsVolume)
    .mustBeTrue(AwsAttribute.Encrypted)
    .message('EBS volumes must be encrypted')
    .rationale('CIS AWS — encrypt EBS at rest'),

  rule()
    .resource(AwsResource.Instance)
    .mustBeTrue(AwsAttribute.RootBlockDeviceEncrypted)
    .message('EC2 root volume must be encrypted')
    .rationale('CIS AWS — encrypt root EBS'),

  rule()
    .resource(AwsResource.RedshiftCluster)
    .mustBeTrue(AwsAttribute.Encrypted)
    .message('Redshift clusters must be encrypted')
    .rationale('CIS AWS — encrypt Redshift'),

  rule()
    .resource(AwsResource.ElasticacheReplicationGroup)
    .mustBeTrue(AwsAttribute.AtRestEncryptionEnabled)
    .message('ElastiCache replication groups must encrypt at rest')
    .rationale('CIS AWS — encrypt ElastiCache'),

  // ── KMS key rotation (CIS §3.9) ────────────────────────────────────────
  rule()
    .resource(AwsResource.KmsKey)
    .mustBeTrue(AwsAttribute.EnableKeyRotation)
    .message('KMS keys must have automatic rotation enabled')
    .rationale('CIS AWS v1.4 §3.9'),

  // ── S3 public access (CIS §2.x) ────────────────────────────────────────
  rule()
    .resource(AwsResource.S3Bucket)
    .denyAcl(Acl.PublicRead, Acl.PublicReadWrite)
    .message('S3 buckets must not have a public ACL')
    .rationale('CIS AWS — no public S3 ACLs'),

  rule()
    .resource(AwsResource.S3Bucket)
    .mustBeTrue(AwsAttribute.BlockPublicAcls)
    .message('S3 buckets must block public ACLs')
    .rationale('CIS AWS — enable block_public_acls'),

  // ── IAM least privilege (CIS §1) ───────────────────────────────────────
  rule()
    .resource(AwsResource.IamPolicy)
    .denyIamWildcard()
    .message('IAM policies must not grant Action "*"')
    .rationale('CIS AWS v1.4 §1.3 — no full privileges'),

  rule()
    .resource(AwsResource.IamPolicy)
    .denyPublicPrincipal()
    .message('IAM policies must not grant access to Principal "*"')
    .rationale('CIS AWS — no public IAM principal'),

  // ── Audit logging (CIS §3) ─────────────────────────────────────────────
  rule()
    .resource(AwsResource.Cloudtrail)
    .mustBeSet(AwsAttribute.KmsKeyId)
    .message('CloudTrail trails must use KMS encryption')
    .rationale('CIS AWS v1.4 §3.6 — encrypt CloudTrail logs'),

  rule()
    .resource(AwsResource.Cloudtrail)
    .mustBeTrue(AwsAttribute.EnableLogFileValidation)
    .message('CloudTrail must enable log file validation')
    .rationale('CIS AWS v1.4 §3.4 — log file integrity'),

  rule()
    .resource(AwsResource.Cloudtrail)
    .mustBeTrue(AwsAttribute.IsMultiRegionTrail)
    .message('CloudTrail must be a multi-region trail')
    .rationale('CIS AWS v1.4 §3.1 — global trail coverage'),

  // ── RDS backup retention (CIS §3) ──────────────────────────────────────
  rule()
    .resource(AwsResource.DbInstance)
    .mustBeAtLeast(AwsAttribute.BackupRetentionPeriod, 7)
    .message('RDS backup retention must be at least 7 days')
    .rationale('CIS AWS — point-in-time recovery window'),

  // ── RDS not publicly accessible (CIS §3) ───────────────────────────────
  rule()
    .resource(AwsResource.DbInstance)
    .mustBeFalse(AwsAttribute.PubliclyAccessible)
    .message('RDS instances must not be publicly accessible')
    .rationale('CIS AWS — no public DB endpoint'),

  // ── ECR image scanning ─────────────────────────────────────────────────
  rule()
    .resource(AwsResource.EcrRepository)
    .mustBeTrue(AwsAttribute.ImageScanOnPush)
    .message('ECR repositories must scan images on push')
    .rationale('CIS — supply-chain: scan on push'),

  // ── Tags (FinOps ownership) ────────────────────────────────────────────
  rule()
    .resource(
      AwsResource.DbInstance,
      AwsResource.S3Bucket,
      AwsResource.SecurityGroup,
    )
    .mustHaveTags(Tag.Team, Tag.CostCenter, Tag.Environment)
    .message('Required tags: team, cost_center, environment')
    .rationale('FinOps ownership + cost allocation'),

  // ── Secrets hygiene (cross-cutting) ────────────────────────────────────
  rule()
    .allResources()
    .denyInsensitiveVariable()
    .message('Secret-looking variables must be marked sensitive')
    .rationale('Plaintext secret variables leak in plans/logs'),

  rule()
    .allResources()
    .denyInsensitiveSecretOutput(
      'aws_db_instance.master_password',
      'aws_secretsmanager_secret_version.secret_string',
    )
    .message('Secret outputs must set sensitive = true')
    .rationale('CIS — do not expose secrets in state/CI logs'),

  rule()
    .allResources()
    .denyPlaintextLocalSecret()
    .message('Locals must not hardcode secrets — use a reference')
    .rationale('CIS — no plaintext secrets in source'),

  rule()
    .allResources()
    .denyProvisioner(Provisioner.LocalExec, Provisioner.RemoteExec)
    .message('Provisioners are forbidden — use user_data / a config manager')
    .rationale('Supply-chain: no arbitrary command execution on apply'),
] as const
