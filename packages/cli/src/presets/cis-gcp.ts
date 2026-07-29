/**
 * CIS Google Cloud Platform Foundations — GCP-specific additions on top of
 * `coreSecurity`.
 *
 * The shared controls (no hardcoded secrets, provisioner denial, required
 * tags) live in `coreSecurity`. This pack adds only the GCP-specific CIS
 * controls. Like `cisAzure`, this pack is larger than `cisAws` because
 * `coreSecurity` is AWS-primary and most GCP CIS controls are cloud-specific.
 *
 * Usage:
 *   import { coreSecurity, cisGcp } from '@dotzen/dotzen'
 *   export const spec = [...coreSecurity, ...cisGcp]
 */
import { rule } from '../spec/rule'
import {
  GcpResource,
  GcpAttribute,
  PublicAccessPreventionMode,
  IamMember,
  PrimitiveRole,
  SqlSslMode,
  IngressSetting,
  Port,
  Block,
  Effect,
} from '../vocabulary'
export const cisGcp = [
  // ── Compute: no public IP (CIS GCP §4.1) ──────────────────────────────
  rule()
    .id('instance-no-public-ip')
    .resource(GcpResource.ComputeInstance)
    .denyBlockPresence(Block.NetworkInterfaceAccessConfig)
    .message('Compute instances must not have public IPs')
    .rationale('CIS GCP §4.1 — no public exposure'),

  // ── Storage (CIS GCP §3) ───────────────────────────────────────────────
  rule()
    .resource(GcpResource.StorageBucket)
    .mustEqual(
      GcpAttribute.PublicAccessPrevention,
      PublicAccessPreventionMode.Enforced,
    )
    .message('Storage buckets must enforce public access prevention')
    .rationale(
      'CIS GCP §3.1 — uniform bucket-level access + public prevention',
    ),

  rule()
    .resource(GcpResource.StorageBucket)
    .mustBeTrue(GcpAttribute.UniformBucketLevelAccess)
    .message('Storage buckets must enable uniform bucket-level access')
    .rationale('CIS GCP — disable legacy ACLs'),

  rule()
    .resource(GcpResource.StorageBucket)
    .mustBeTrue(GcpAttribute.VersioningEnabled)
    .message('Storage buckets must enable versioning')
    .rationale('CIS GCP — data durability'),

  // ── Cloud SQL (CIS GCP §6) ─────────────────────────────────────────────
  rule()
    .resource(GcpResource.SqlDatabaseInstance)
    .mustBeOneOf(
      GcpAttribute.SslMode,
      SqlSslMode.EncryptedOnly,
      SqlSslMode.TrustedClientCertRequired,
    )
    .message('Cloud SQL instances must require SSL')
    .rationale('CIS GCP §6.2 — encrypt DB connections'),

  rule()
    .resource(GcpResource.SqlDatabaseInstance)
    .denyWhenTrue(GcpAttribute.Ipv4Enabled)
    .message('Cloud SQL instances must not have a public IPv4 address')
    .rationale('CIS GCP §6.1 — no public IP'),

  rule()
    .resource(GcpResource.SqlDatabaseInstance)
    .denyLiteral(GcpAttribute.RootPassword)
    .message('Cloud SQL root passwords must be a reference, not a literal')
    .rationale('CIS GCP — no hardcoded DB passwords'),

  // ── GKE (CIS GCP §7) ───────────────────────────────────────────────────
  rule()
    .resource(GcpResource.ContainerCluster)
    .mustBeTrue(GcpAttribute.EnablePrivateNodes)
    .message('GKE clusters must use private nodes')
    .rationale('CIS GCP §7.1 — private cluster nodes'),

  rule()
    .resource(GcpResource.ContainerCluster)
    .mustBeFalse(GcpAttribute.EnableLegacyAbac)
    .message('GKE clusters must disable legacy ABAC')
    .rationale('CIS GCP §7.3 — use RBAC only'),

  // ── GKE Workload Identity (CIS GCP §7.4) ──────────────────────────────
  rule()
    .id('gke-workload-identity')
    .resource(GcpResource.ContainerCluster)
    .mustHaveBlock(Block.WorkloadIdentityConfig)
    .message('GKE clusters must enable Workload Identity')
    .rationale(
      'CIS GCP §7.4 — pods authenticate as their own identity, not the node SA',
    ),

  // ── GKE Shielded Nodes (CIS GCP §7.x) ──────────────────────────────────
  rule()
    .id('gke-shielded-nodes')
    .resource(GcpResource.ContainerCluster)
    .mustBeTrue(GcpAttribute.ShieldedNodesEnabled)
    .onViolation(Effect.Warn)
    .message('GKE clusters must enable Shielded GKE Nodes')
    .rationale(
      'CIS GCP — Shielded Nodes provide integrity verification (secure boot + ' +
        'measured boot) at the node level, complementing per-instance shielded VMs',
    ),

  // ── Cloud Audit Logs config presence (CIS GCP §2.x) ───────────────────
  rule()
    .id('require-audit-config')
    .allResources()
    .requireResource(GcpResource.ProjectIamAuditConfig)
    .onViolation(Effect.Warn)
    .message('A project IAM audit config must be declared (Cloud Audit Logs)')
    .rationale(
      'CIS GCP §2.x — an audit config captures admin/data read/write access ' +
        'logs; absence means actions go unlogged',
    ),

  // ── KMS (CIS GCP §3) ───────────────────────────────────────────────────
  rule()
    .resource(GcpResource.KmsCryptoKey)
    .mustBeSet(GcpAttribute.RotationPeriod)
    .message('KMS crypto keys must have a rotation period set')
    .rationale('CIS GCP §3.8 — key rotation'),

  // ── Compute (CIS GCP §4) ───────────────────────────────────────────────
  rule()
    .resource(GcpResource.ComputeInstance)
    .mustBeTrue(GcpAttribute.EnableSecureBoot)
    .message('Compute instances must enable secure boot')
    .rationale('CIS GCP §4.4 — shielded VMs'),

  rule()
    .resource(GcpResource.ComputeInstance)
    .denyWhenTrue(GcpAttribute.CanIpForward)
    .message('Compute instances must not enable IP forwarding')
    .rationale('CIS GCP §4.5 — no IP forwarding'),

  // ── IAM (CIS GCP §1) ───────────────────────────────────────────────────
  rule()
    .resource(GcpResource.StorageBucketIamMember, GcpResource.ProjectIamMember)
    .denyValue(GcpAttribute.Member, IamMember.AllUsers)
    .message('IAM members must not grant access to allUsers (public)')
    .rationale('CIS GCP §1.3 — no public access'),

  rule()
    .resource(GcpResource.StorageBucketIamMember, GcpResource.ProjectIamMember)
    .denyValue(GcpAttribute.Member, IamMember.AllAuthenticatedUsers)
    .message('IAM members must not grant access to allAuthenticatedUsers')
    .rationale('CIS GCP §1.3 — restrict to known principals'),

  rule()
    .resource(GcpResource.StorageBucketIamMember, GcpResource.ProjectIamMember)
    .denyValue(GcpAttribute.Role, PrimitiveRole.Owner)
    .message('IAM must not grant the Owner primitive role')
    .rationale('CIS GCP §1.1 — least privilege'),

  rule()
    .resource(GcpResource.StorageBucketIamMember, GcpResource.ProjectIamMember)
    .denyValue(GcpAttribute.Role, PrimitiveRole.Editor)
    .message('IAM must not grant the Editor primitive role')
    .rationale('CIS GCP §1.1 — least privilege'),

  // ── Cloud Run Functions ────────────────────────────────────────────────
  rule()
    .resource(GcpResource.Cloudfunctions2Function)
    .denyValue(GcpAttribute.IngressSettings, IngressSetting.AllowAll)
    .message('Cloud Run Functions must not allow unrestricted ingress')
    .rationale('CIS GCP — restrict function ingress'),

  rule()
    .resource(GcpResource.Cloudfunctions2Function)
    .mustBeSet(GcpAttribute.ServiceAccountEmail)
    .message('Cloud Run Functions must set a runtime service account')
    .rationale('CIS GCP — least-privilege runtime identity'),

  // ── Compute firewall: no SSH open to the internet ──────────────────────
  rule()
    .resource(GcpResource.ComputeFirewall)
    .denyIngress(Port.SSH)
    .message('Firewall rules must not open SSH to the internet')
    .rationale('CIS GCP §4.6 — no public SSH'),

  // ── BigQuery dataset public access (CIS GCP) ───────────────────────────
  // Flag a public grant via the standalone resource (`special_group`) OR the
  // dataset's inline access block (`access.special_group`). Two conditions on
  // one rule: each resource type trips only its own (the other attr is absent
  // → pass). NOTE: the inline form catches the FIRST access block only (the
  // flattener recurses into v[0]); a multi-block dataset where a later block
  // is public is a known gap (needs the multi-block collect change).
  rule()
    .id('bigquery-no-public-access')
    .resource(GcpResource.BigqueryDatasetAccess, GcpResource.BigqueryDataset)
    .denyValue(GcpAttribute.SpecialGroup, IamMember.AllAuthenticatedUsers)
    .denyValue(GcpAttribute.AccessSpecialGroup, IamMember.AllAuthenticatedUsers)
    .message('BigQuery datasets must not grant access to allAuthenticatedUsers')
    .rationale('CIS GCP — restrict dataset access to known principals'),
] as const
