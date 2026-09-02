/**
 * Enterprise profile — multi-cloud CIS baselines + ownership metadata +
 * change-safety gates for production.
 *
 * Generated from the `enterprise` profile (`pluvian init --profile enterprise`).
 * Spreads coreSecurity + the three CIS packs, then adds mandatory ownership
 * tags + a production prevent_destroy approval gate. Edit the OrgTag enum +
 * the approver set / stateful types to match your org.
 */

import {
  coreSecurity,
  cisAws,
  cisAzure,
  cisGcp,
  rule,
  AwsResource,
  Tag,
  Effect,
  Environment,
  Approver,
  LifecycleAttribute,
} from '@erkos/pluvian'

// Org-specific tag taxonomy (tag KEYS are org-defined — declare them as an
// enum so a typo is a compile error, not a silently-never-fires rule).
enum OrgTag {
  Application = 'Application',
  Owner = 'Owner',
  CostCenter = 'cost_center',
}

export const spec = [
  ...coreSecurity,
  ...cisAws,
  ...cisAzure,
  ...cisGcp,
  // ── Ownership metadata across the estate ─────────────────────────────
  rule()
    .allResources()
    .mustHaveTags(OrgTag.Application, OrgTag.Owner, Tag.Environment)
    .onViolation(Effect.Block)
    .message('Resources must carry Application, Owner, and environment tags')
    .rationale(
      'Enterprise ownership metadata: cost attribution, blast-radius ' +
        'routing, and change-advisory notifications all depend on it.',
    ),

  // ── Production change-safety: no accidental destruction ──────────────
  // Stateful prod resources must opt into `prevent_destroy`. A resource
  // without it is allowed (the team may have a reason) but the change
  // pauses CI for security + SRE sign-off — RequireApproval, not Block.
  rule()
    .resource(
      AwsResource.DbInstance,
      AwsResource.RdsCluster,
      AwsResource.ElasticacheReplicationGroup,
      AwsResource.S3Bucket,
    )
    .environment(Environment.Production)
    .mustBeTrue(LifecycleAttribute.PreventDestroy)
    .onViolation(Effect.RequireApproval)
    .approvers(Approver.SecurityArchitect, Approver.SRE)
    .message(
      'Stateful production resources should set prevent_destroy — approval ' +
        'required to merge without it',
    )
    .rationale(
      'Accidental destruction of stateful prod resources (RDS, ElastiCache, ' +
        'S3) is the #1 cause of unrepeatable outages. prevent_destroy makes ' +
        'destroy a conscious, reviewed two-step action.',
    ),
]
