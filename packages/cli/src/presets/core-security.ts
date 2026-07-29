/**
 * Core security baseline — the 80% shared across CIS, PCI DSS, SOC 2, NIST
 * 800-53, and GDPR/LGPD. A composable `Rule[]` meant to be spread alongside
 * a framework-specific pack:
 *
 *   import { coreSecurity, pciDss } from '@dotzen/dotzen'
 *   export const spec = [...coreSecurity, ...pciDss, /* your rules *\/]
 *
 * Covers: network exposure, encryption at rest (key resources), IAM least
 * privilege, audit logging, no hardcoded secrets, required tags, and
 * provisioner denial. Framework packs ADD stricter/broader controls on top.
 *
 * Cloud-neutral where possible (AWS-primary; Azure/GCP coverage comes from
 * the per-cloud CIS presets). Each rule carries `.rationale()`.
 */
import { rule } from '../spec/rule'
import {
  AwsResource,
  AwsAttribute,
  Port,
  Tag,
  Acl,
  Provisioner,
  Effect,
  MskClientBrokerEncryption,
} from '../vocabulary'

export const coreSecurity = [
  // ── Network exposure ───────────────────────────────────────────────────
  rule()
    .resource(AwsResource.SecurityGroup)
    .denyIngress(Port.SSH, Port.RDP)
    .message('SSH and RDP must not be open to the internet')
    .rationale(
      'Common control: no public SSH/RDP — CIS §5.2, PCI 1.2.1, NIST AC-17',
    ),

  rule()
    .resource(AwsResource.SecurityGroup)
    .denyIngress(Port.Postgres, Port.MySQL)
    .message('Database ports must not be open to the internet')
    .rationale('Common control: restrict DB ingress — PCI 1.2.1, NIST SC-7'),

  // ── Encryption at rest (key resource types) ────────────────────────────
  rule()
    .resource(AwsResource.DbInstance)
    .mustBeTrue(AwsAttribute.StorageEncrypted)
    .message('RDS instances must encrypt storage at rest')
    .rationale(
      'Common control: encrypt data at rest — PCI 3.4, SOC CC6.1, NIST SC-28',
    ),

  rule()
    .resource(AwsResource.EbsVolume)
    .mustBeTrue(AwsAttribute.Encrypted)
    .message('EBS volumes must be encrypted')
    .rationale('Common control: encrypt data at rest — PCI 3.4, NIST SC-28'),

  rule()
    .resource(AwsResource.Instance)
    .mustBeTrue(AwsAttribute.RootBlockDeviceEncrypted)
    .message('EC2 root volume must be encrypted')
    .rationale('Common control: encrypt root EBS — NIST SC-28'),

  rule()
    .resource(AwsResource.KmsKey)
    .mustBeTrue(AwsAttribute.EnableKeyRotation)
    .message('KMS keys must have automatic rotation enabled')
    .rationale('Common control: key rotation — PCI 3.6, NIST MA-2'),

  // ── IAM least privilege ────────────────────────────────────────────────
  rule()
    .resource(
      AwsResource.IamPolicy,
      AwsResource.IamRolePolicy,
      AwsResource.IamUserPolicy,
    )
    .denyIamWildcard()
    .message('IAM policies must not grant Action "*"')
    .rationale(
      'Common control: least privilege — PCI 7.2.1, SOC CC6.3, NIST AC-2(1)',
    ),

  rule()
    .resource(
      AwsResource.IamPolicy,
      AwsResource.IamRolePolicy,
      AwsResource.IamUserPolicy,
    )
    .denyPublicPrincipal()
    .message('IAM policies must not grant access to Principal "*"')
    .rationale('Common control: no public access — NIST AC-3'),

  // ── No inline IAM policies (use managed policies instead) ─────────────
  rule()
    .id('iam-user-no-inline-policy')
    .resource(AwsResource.IamUser)
    .denyIfAssociated(AwsResource.IamUserPolicy, AwsAttribute.User)
    .onViolation(Effect.Warn)
    .message('IAM users must not have inline policies — use managed policies')
    .rationale(
      'Common control: centralized policy management — PCI 7.2.1, NIST AC-2(1)',
    ),

  rule()
    .id('iam-role-no-inline-policy')
    .resource(AwsResource.IamRole)
    .denyIfAssociated(AwsResource.IamRolePolicy, AwsAttribute.Role)
    .onViolation(Effect.Warn)
    .message('IAM roles must not have inline policies — use managed policies')
    .rationale(
      'Common control: centralized policy management — PCI 7.2.1, NIST AC-2(1)',
    ),

  // ── Audit logging ──────────────────────────────────────────────────────
  rule()
    .resource(AwsResource.Cloudtrail)
    .mustBeSet(AwsAttribute.KmsKeyId)
    .message('CloudTrail trails must use KMS encryption')
    .rationale(
      'Common control: protect audit logs — PCI 10.5, SOC CC7.2, NIST AU-9',
    ),

  rule()
    .resource(AwsResource.Cloudtrail)
    .mustBeTrue(AwsAttribute.IsMultiRegionTrail)
    .message('CloudTrail must be a multi-region trail')
    .rationale('Common control: global audit coverage — PCI 10.1, NIST AU-3'),

  // ── S3 public access (baseline) ────────────────────────────────────────
  rule()
    .resource(AwsResource.S3Bucket)
    .denyAcl(Acl.PublicRead, Acl.PublicReadWrite)
    .message('S3 buckets must not have a public ACL')
    .rationale(
      'Common control: no public object storage — PCI 1.3.4, GDPR Art. 32',
    ),

  // ── No hardcoded secrets ───────────────────────────────────────────────
  rule()
    .allResources()
    .denyInsensitiveVariable()
    .message('Secret-looking variables must be marked sensitive')
    .rationale(
      'Common control: protect secrets — PCI 3.5, SOC CC6.1, GDPR Art. 32',
    ),

  rule()
    .allResources()
    .denyPlaintextLocalSecret()
    .message('Locals must not hardcode secrets — use a reference')
    .rationale('Common control: no plaintext secrets — PCI 3.5, NIST IA-5'),

  rule()
    .allResources()
    .denyInsensitiveSecretOutput(
      'aws_db_instance.master_password',
      'aws_secretsmanager_secret_version.secret_string',
    )
    .message('Secret outputs must set sensitive = true')
    .rationale('Common control: do not expose secrets — PCI 3.5, GDPR Art. 32'),

  rule()
    .allResources()
    .denyPlaintextConnectionSecret()
    .message('Connection blocks must not hardcode secrets — use a reference')
    .rationale(
      'Common control: no plaintext secrets in provisioner connections — PCI 3.5',
    ),

  // ── Provisioner denial ─────────────────────────────────────────────────
  rule()
    .allResources()
    .denyProvisioner(
      Provisioner.LocalExec,
      Provisioner.RemoteExec,
      Provisioner.File,
    )
    .message('Provisioners are forbidden — use user_data / a config manager')
    .rationale(
      'Common control: no arbitrary command execution — SOC CC7.4, NIST CM-7',
    ),

  // ── Required tags (baseline ownership) ─────────────────────────────────
  rule()
    .resource(
      AwsResource.DbInstance,
      AwsResource.S3Bucket,
      AwsResource.SecurityGroup,
    )
    .mustHaveTags(Tag.Team, Tag.CostCenter, Tag.Environment)
    .message('Required tags: team, cost_center, environment')
    .rationale(
      'Common control: ownership + cost allocation — SOC CC5.2, NIST AC-2',
    ),

  // ── RDS backup retention (baseline ≥7) ─────────────────────────────────
  // Aurora clusters (`aws_rds_cluster`) carry `backup_retention_period` too.
  rule()
    .resource(AwsResource.DbInstance, AwsResource.RdsCluster)
    .mustBeAtLeast(AwsAttribute.BackupRetentionPeriod, 7)
    .message('RDS/Aurora backup retention must be at least 7 days')
    .rationale('Common control: recoverability — SOC CC7.3, NIST CP-9'),

  // ── EFS encryption at rest ─────────────────────────────────────────────
  rule()
    .resource(AwsResource.EfsFileSystem)
    .mustBeTrue(AwsAttribute.Encrypted)
    .message('EFS file systems must be encrypted at rest')
    .rationale('Common control: encrypt data at rest — PCI 3.4, NIST SC-28'),

  // ── CloudWatch log retention (warn — best practice, not a hard block) ──
  rule()
    .id('cloudwatch-log-retention')
    .resource(AwsResource.CloudwatchLogGroup)
    .mustBeSet(AwsAttribute.RetentionInDays)
    .onViolation(Effect.Warn)
    .message('CloudWatch log groups must set retention_in_days')
    .rationale(
      'Common control: log lifecycle — SOC CC7.2, NIST AU-11. ' +
        'AI-generated configs often omit retention, leaving logs forever.',
    ),

  // ── SQS queue KMS encryption (warn — data-in-transit-at-rest) ──────────
  rule()
    .id('sqs-kms-encryption')
    .resource(AwsResource.SqsQueue)
    .mustBeSet(AwsAttribute.KmsMasterKeyId)
    .onViolation(Effect.Warn)
    .message('SQS queues must set kms_master_key_id for encryption at rest')
    .rationale(
      'Common control: encrypt queue messages — SOC CC6.1, GDPR Art. 32',
    ),

  // ── SNS topic KMS encryption (warn — data-in-transit-at-rest) ──────────
  rule()
    .id('sns-kms-encryption')
    .resource(AwsResource.SnsTopic)
    .mustBeSet(AwsAttribute.KmsMasterKeyId)
    .onViolation(Effect.Warn)
    .message('SNS topics must set kms_master_key_id for encryption at rest')
    .rationale(
      'Common control: encrypt topic messages — SOC CC6.1, GDPR Art. 32',
    ),

  // ── DynamoDB encryption at rest + PITR ──────────────────────────────────
  rule()
    .id('dynamodb-encryption')
    .resource(AwsResource.DynamodbTable)
    .mustBeTrue(AwsAttribute.ServerSideEncryptionEnabled)
    .message('DynamoDB tables must encrypt data at rest')
    .rationale('Common control: encrypt data at rest — PCI 3.4, NIST SC-28'),

  rule()
    .id('dynamodb-pitr')
    .resource(AwsResource.DynamodbTable)
    .mustBeTrue(AwsAttribute.PointInTimeRecoveryEnabled)
    .onViolation(Effect.Warn)
    .message('DynamoDB tables must enable point-in-time recovery')
    .rationale('Common control: recoverability — SOC CC7.3, NIST CP-9'),

  // ── RDS cluster encryption at rest ─────────────────────────────────────
  // Aurora (`aws_rds_cluster`) and DocumentDB (`aws_docdb_cluster`) both
  // carry `storage_encrypted`. Redshift uses a different attr (`encrypted`)
  // and is governed separately in the CIS/PCI/NIST packs.
  rule()
    .id('rds-cluster-encryption')
    .resource(AwsResource.RdsCluster, AwsResource.DocdbCluster)
    .mustBeTrue(AwsAttribute.StorageEncrypted)
    .message('RDS/Aurora and DocDB clusters must encrypt storage at rest')
    .rationale('Common control: encrypt data at rest — PCI 3.4, NIST SC-28'),

  // ── OpenSearch (Elasticsearch) encryption at rest + node-to-node TLS ─────
  rule()
    .id('opensearch-encryption-at-rest')
    .resource(AwsResource.OpensearchDomain)
    .mustBeTrue(AwsAttribute.OpenSearchEncryptAtRest)
    .message('OpenSearch domains must encrypt data at rest')
    .rationale('Common control: encrypt data at rest — PCI 3.4, NIST SC-28'),

  rule()
    .id('opensearch-node-to-node-encryption')
    .resource(AwsResource.OpensearchDomain)
    .mustBeTrue(AwsAttribute.OpenSearchNodeToNodeEncryption)
    .onViolation(Effect.Warn)
    .message('OpenSearch domains must enable node-to-node encryption')
    .rationale('Common control: encrypt data in transit between nodes'),

  // ── Amazon MSK: no plaintext broker traffic ────────────────────────────
  // `client_broker = "PLAINTEXT"` disables TLS between clients and brokers.
  // The attribute lives in a 2-level nested block; absence defaults to TLS.
  rule()
    .id('msk-no-plaintext-client-broker')
    .resource(AwsResource.MskCluster)
    .denyValue(
      AwsAttribute.MskClientBroker,
      MskClientBrokerEncryption.Plaintext,
    )
    .message('MSK clusters must not use PLAINTEXT client_broker (TLS required)')
    .rationale('Common control: encrypt broker traffic in transit — PCI 4.1'),

  // ── No hardcoded secrets on resource attributes ───────────────────────
  rule()
    .id('no-hardcoded-db-password')
    .resource(AwsResource.DbInstance)
    .denyLiteral(AwsAttribute.Password)
    .message('RDS passwords must be a reference, not a literal')
    .rationale('Common control: no plaintext secrets — PCI 3.5, GDPR Art. 32'),

  // ── No hardcoded Aurora/Redshift/DocDB cluster master passwords ─────────
  // Clusters use `master_password` (distinct from `aws_db_instance.password`).
  rule()
    .id('no-hardcoded-cluster-password')
    .resource(
      AwsResource.RdsCluster,
      AwsResource.RedshiftCluster,
      AwsResource.DocdbCluster,
    )
    .denyLiteral(AwsAttribute.MasterPassword)
    .message('Cluster master passwords must be a reference, not a literal')
    .rationale('Common control: no plaintext secrets — PCI 3.5, GDPR Art. 32'),

  // ── No hardcoded ElastiCache AUTH token ────────────────────────────────
  // `auth_token` is the Redis AUTH credential for a replication group.
  rule()
    .id('no-hardcoded-elasticache-auth-token')
    .resource(AwsResource.ElasticacheReplicationGroup)
    .denyLiteral(AwsAttribute.AuthToken)
    .message('ElastiCache auth tokens must be a reference, not a literal')
    .rationale('Common control: no plaintext secrets — PCI 3.5, GDPR Art. 32'),

  // ── No hardcoded Amazon MQ broker admin password ──────────────────────
  rule()
    .id('no-hardcoded-mq-admin-password')
    .resource(AwsResource.MqBroker)
    .denyLiteral(AwsAttribute.MqAdminPassword)
    .message(
      'Amazon MQ broker admin passwords must be a reference, not a literal',
    )
    .rationale('Common control: no plaintext secrets — PCI 3.5, GDPR Art. 32'),

  // ── No hardcoded Secrets Manager secret values ────────────────────────
  // WARN (not block): Secrets Manager is the right *destination*, but a
  // literal `secret_string` still lands in Terraform state + VCS. Surface it
  // so the author moves the value to a reference / generated credential.
  rule()
    .id('no-hardcoded-secret-string')
    .resource(AwsResource.SecretsmanagerSecretVersion)
    .denyLiteral(AwsAttribute.SecretString)
    .onViolation(Effect.Warn)
    .message(
      'Secrets Manager secret_string should be a reference, not a literal (lands in state/VCS)',
    )
    .rationale('Common control: no plaintext secrets — PCI 3.5, GDPR Art. 32'),

  // ── State backend must be encrypted ───────────────────────────────────
  rule()
    .id('encrypted-state')
    .allResources()
    .requireEncryptedBackend()
    .message('State backend must be encrypted')
    .rationale('Common control: protect state secrets — PCI 10.5, SOC CC7.2'),

  // ── ECS cluster container insights ──────────────────────────────────
  rule()
    .id('ecs-container-insights')
    .resource(AwsResource.EcsCluster)
    .mustEqual(AwsAttribute.EcsSettingValue, 'enabled')
    .onViolation(Effect.Warn)
    .message('ECS clusters must enable container insights')
    .rationale(
      'CIS AWS — monitoring and observability for container workloads',
    ),
] as const
