import { rule, AwsResource, AwsAttribute, Port, Tag, Provisioner } from '../../../../../src/index'

enum OrgTag {
  CostCenter = 'cost_center',
}

export const spec = [
  // Security group: no public DB port
  rule()
    .id('no-public-db-port')
    .resource(AwsResource.SecurityGroup)
    .denyIngress(Port.Postgres, Port.MySQL)
    .message('Database ports must not be open to the internet')
    .rationale('Common control: restrict DB ingress — PCI 1.2.1, NIST SC-7'),

  // RDS: encrypted at rest
  rule()
    .id('rds-encrypted-at-rest')
    .resource(AwsResource.DbInstance)
    .mustBeTrue(AwsAttribute.StorageEncrypted)
    .message('RDS instances must encrypt storage at rest')
    .rationale('Common control: encrypt data at rest — PCI 3.4, SOC CC6.1, NIST SC-28'),

  // RDS: not publicly accessible
  rule()
    .id('rds-not-public')
    .resource(AwsResource.DbInstance)
    .mustBeFalse(AwsAttribute.PubliclyAccessible)
    .message('RDS instances must not be publicly accessible')
    .rationale('Common control: restrict access — GDPR Art. 5(1)(f), NIST AC-2'),

  // RDS: backup retention >= 7 days
  rule()
    .id('rds-backup-retention')
    .resource(AwsResource.DbInstance)
    .mustBeAtLeast(AwsAttribute.BackupRetentionPeriod, 7)
    .message('RDS backup retention must be at least 7 days')
    .rationale('Common control: recoverability — SOC CC7.3, NIST CP-9'),

  // KMS: rotation enabled
  rule()
    .id('kms-rotation')
    .resource(AwsResource.KmsKey)
    .mustBeTrue(AwsAttribute.EnableKeyRotation)
    .message('KMS keys must have automatic rotation enabled')
    .rationale('Common control: key rotation — PCI 3.6, NIST MA-2'),

  // Tags: ownership (lowercase keys match Tag.Team / Tag.CostCenter /
  // Tag.Environment so this fixture PASSES the tag rule — contrast with
  // realistic-rds which uses capitalized "Team" to surface a violation).
  rule()
    .id('required-ownership-tags')
    .resource(AwsResource.DbInstance, AwsResource.S3Bucket, AwsResource.SecurityGroup)
    .mustHaveTags(Tag.Team, OrgTag.CostCenter, Tag.Environment)
    .message('Required tags: team, cost_center, environment')
    .rationale('Common control: ownership + cost allocation — SOC CC5.2, NIST AC-2'),

  // Secrets
  rule()
    .id('no-insensitive-variables')
    .allResources()
    .denyInsensitiveVariable()
    .message('Secret-looking variables must be marked sensitive'),

  rule()
    .id('no-hardcoded-locals')
    .allResources()
    .denyPlaintextLocalSecret()
    .message('Locals must not hardcode secrets — use a reference'),

  // Provisioners forbidden
  rule()
    .id('no-provisioners')
    .allResources()
    .denyProvisioner(Provisioner.LocalExec, Provisioner.RemoteExec, Provisioner.File)
    .message('Provisioners are forbidden — use user_data / a config manager'),

  // State must be encrypted (no terraform{} block → local default backend
  // → fires on the synthetic `terraform` resource).
  rule()
    .id('encrypted-state')
    .allResources()
    .requireEncryptedBackend()
    .message('State backend must be encrypted'),
]
