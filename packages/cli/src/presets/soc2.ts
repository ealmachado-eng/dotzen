/**
 * SOC 2 (Trust Services Criteria) — additions on top of `coreSecurity`.
 *
 * SOC 2 adds: change management (version pinning for TF engine, providers,
 * and registry modules), encrypted + non-local state, and ECR image
 * scanning (processing integrity + supply chain).
 *
 * Usage:
 *   import { coreSecurity, soc2 } from '@erkos/pluvian'
 *   export const spec = [...coreSecurity, ...soc2]
 */
import { rule } from '../spec/rule'
import { AwsResource, AwsAttribute } from '../vocabulary'

export const soc2 = [
  // ── Change management (SOC CC8.1) ──────────────────────────────────────
  rule()
    .allResources()
    .requireExactTerraformVersion()
    .message(
      'Terraform required_version must be an exact pin (SOC CC8.1 — change mgmt)',
    )
    .rationale('SOC 2 CC8.1 — pin tooling versions for reproducible changes'),

  rule()
    .allResources()
    .denyFloatingProviderVersion('aws', 'google', 'azurerm')
    .message('Provider versions must be pinned (SOC CC8.1 — change mgmt)')
    .rationale('SOC 2 CC8.1 — no floating provider constraints'),

  rule()
    .allResources()
    .denyFloatingModuleVersion()
    .message(
      'Registry module versions must be pinned (SOC CC8.1 — change mgmt)',
    )
    .rationale('SOC 2 CC8.1 — no floating module versions'),

  // ── State management (SOC CC7.2, CC6.6) ────────────────────────────────
  rule()
    .allResources()
    .requireEncryptedBackend()
    .message(
      'State backend must be encrypted (SOC CC7.2 — protect system state)',
    )
    .rationale('SOC 2 CC7.2 — state files may contain sensitive configuration'),

  rule()
    .allResources()
    .denyLocalBackend()
    .message('Local state is forbidden under SOC 2 — use a remote backend')
    .rationale('SOC 2 CC6.6 — centralized state for access control + audit'),

  // ── Supply chain / processing integrity (SOC CC7.4, PI1.2) ─────────────
  rule()
    .resource(AwsResource.EcrRepository)
    .mustBeTrue(AwsAttribute.ImageScanOnPush)
    .message(
      'ECR repositories must scan images on push (SOC CC7.4 — supply chain)',
    )
    .rationale('SOC 2 CC7.4 + PI1.2 — scan container images before deployment'),

  // ── CloudTrail log file validation (SOC CC7.2 — log integrity) ─────────
  rule()
    .resource(AwsResource.Cloudtrail)
    .mustBeTrue(AwsAttribute.EnableLogFileValidation)
    .message(
      'CloudTrail must enable log file validation (SOC CC7.2 — log integrity)',
    )
    .rationale('SOC 2 CC7.2 — detect tampering of audit logs'),
] as const
