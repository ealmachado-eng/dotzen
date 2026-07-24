/**
 * CIS Google Cloud Platform Foundations Benchmark — curated starter preset
 * (#24). High-impact GCP controls: storage public access prevention, Cloud SQL
 * SSL/IP exposure, GKE private nodes + legacy ABAC, KMS rotation, compute
 * shielded VMs, IAM public-principal + primitive-role denial. A STARTER.
 *
 * Usage:
 *   import { cisGcp } from '@dotzen/dotzen'
 *   export const spec = [...cisGcp, /* your custom rules *\/]
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
  Provisioner,
} from '../vocabulary'

export const cisGcp = [
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

  // ── Cross-cutting ──────────────────────────────────────────────────────
  rule()
    .allResources()
    .denyInsensitiveVariable()
    .message('Secret-looking variables must be marked sensitive')
    .rationale('CIS — secrets leak in plans/logs without sensitive flag'),

  rule()
    .allResources()
    .denyPlaintextLocalSecret()
    .message('Locals must not hardcode secrets — use a reference')
    .rationale('CIS — no plaintext secrets in source control'),

  rule()
    .allResources()
    .denyProvisioner(Provisioner.LocalExec, Provisioner.RemoteExec)
    .message('Provisioners are forbidden — use a config manager')
    .rationale('CIS — no arbitrary command execution on apply'),
] as const
