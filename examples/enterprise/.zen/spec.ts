/**
 * Enterprise profile — multi-cloud CIS baselines + ownership metadata +
 * change-safety gates for production.
 *
 * Builds on the startup baseline by spreading the three CIS Foundations
 * packs (AWS / Azure / GCP) so a poly-cloud estate gets a consistent
 * floor, then adds:
 *   - mandatory ownership tags (Application / Owner / environment), and
 *   - a production change-safety gate: stateful resources in production
 *     must set `lifecycle.prevent_destroy` — if not, the change requires
 *     security + SRE sign-off instead of auto-merging.
 *
 * Copy this file to `<your-project>/.zen/spec.ts`, edit the `OrgTag` enum
 * to your org's tag keys, and adjust the approver set / stateful types to
 * match what you gate on.
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
} from '@dotzen/dotzen'

// Org-specific tag taxonomy (see the dotzen-spec-authoring skill: tag KEYS
// are org-defined, so declare them as an enum — never bare strings — so a
// typo is a compile error, not a silently-never-fires rule).
enum OrgTag {
  Application = 'Application',
  Owner = 'Owner',
  CostCenter = 'cost_center',
}

export const spec = [
  // ── Baselines ────────────────────────────────────────────────────────
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
