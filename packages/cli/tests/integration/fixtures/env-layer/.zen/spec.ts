import {
  rule,
  AwsResource,
  AwsAttribute,
  Port,
  Environment,
} from '../../../../../src/index'

// Org tag taxonomy (case-sensitive keys) — supplied by callers via var.tags.
enum OrgTag {
  ApmId = 'apm_id',
  CmdbAppId = 'cmdb_app_id',
  Application = 'Application',
  Ou = 'Ou',
  Environment = 'Environment',
}

export const spec = [
  // ── Baseline: every environment ────────────────────────────────────────
  rule()
    .resource(
      AwsResource.DbInstance,
      AwsResource.RdsCluster,
      AwsResource.Instance,
    )
    .mustHaveTags(
      OrgTag.ApmId,
      OrgTag.CmdbAppId,
      OrgTag.Application,
      OrgTag.Ou,
      OrgTag.Environment,
    )
    .message(
      'Resources must carry apm_id, cmdb_app_id, Application, Ou, Environment',
    ),

  rule()
    .resource(AwsResource.SecurityGroup)
    .denyIngress(Port.SSH, Port.RDP, Port.Postgres, Port.MySQL)
    .message('SSH/RDP/DB ports must not be open to 0.0.0.0/0'),

  rule()
    .resource(AwsResource.DbInstance)
    .mustBeAtLeast(AwsAttribute.BackupRetentionPeriod, 7)
    .message('RDS backup retention must be >= 7 days'),

  // ── Production only: stricter (folder-driven scoping) ───────────────────
  rule()
    .resource(AwsResource.DbInstance, AwsResource.RdsCluster)
    .environment(Environment.Production)
    .mustBeTrue(AwsAttribute.DeletionProtection)
    .message('Production databases must enable deletion_protection'),

  rule()
    .resource(AwsResource.DbInstance)
    .environment(Environment.Production)
    .mustBeAtLeast(AwsAttribute.BackupRetentionPeriod, 30)
    .message('Production RDS backup retention must be >= 30 days'),
]
