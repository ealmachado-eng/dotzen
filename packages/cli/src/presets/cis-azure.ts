/**
 * CIS Microsoft Azure Foundations — Azure-specific additions on top of
 * `coreSecurity`.
 *
 * The shared controls (no hardcoded secrets, provisioner denial, required
 * tags) live in `coreSecurity`. This pack adds only the Azure-specific CIS
 * controls. Note: `coreSecurity` is AWS-primary (CloudTrail, IAM policy,
 * S3) — Azure's CIS controls are almost entirely cloud-specific, so this
 * pack is larger than `cisAws`.
 *
 * Usage:
 *   import { coreSecurity, cisAzure } from '@dotzen/dotzen'
 *   export const spec = [...coreSecurity, ...cisAzure]
 */
import { rule } from '../spec/rule'
import {
  AzureResource,
  AzureAttribute,
  StorageTlsVersion,
  SqlTlsVersion,
  NetworkDefaultAction,
  BuiltInRole,
  Port,
  Effect,
} from '../vocabulary'

export const cisAzure = [
  // ── Network: no public SSH/RDP (CIS Azure §6.1-6.2) ──────────────────
  rule()
    .id('nsg-no-public-ssh')
    .resource(AzureResource.NetworkSecurityGroup)
    .denyIngress(Port.SSH, Port.RDP)
    .message('SSH/RDP must not be open to the internet')
    .rationale('CIS Azure §6.1-6.2'),

  // ── Storage account (CIS Azure §3) ─────────────────────────────────────
  rule()
    .resource(AzureResource.StorageAccount)
    .mustBeOneOf(AzureAttribute.MinTlsVersion, StorageTlsVersion.Tls12)
    .message('Storage accounts must enforce TLS 1.2 minimum')
    .rationale('CIS Azure §3.6 — enforce TLS 1.2'),

  rule()
    .resource(AzureResource.StorageAccount)
    .mustBeFalse(AzureAttribute.AllowNestedItemsToBePublic)
    .message('Storage accounts must not allow public nested items')
    .rationale('CIS Azure §3.5 — disallow public blobs'),

  rule()
    .resource(AzureResource.StorageAccount)
    .mustBeOneOf(
      AzureAttribute.NetworkRulesDefaultAction,
      NetworkDefaultAction.Deny,
    )
    .message('Storage account network rules must default to Deny')
    .rationale('CIS Azure §3.7 — restrict network access'),

  rule()
    .resource(AzureResource.StorageAccount)
    .mustBeFalse(AzureAttribute.PublicNetworkAccessEnabled)
    .message('Storage accounts must disable public network access')
    .rationale('CIS Azure — no public endpoint'),

  rule()
    .id('storage-infrastructure-encryption')
    .resource(AzureResource.StorageAccount)
    .mustBeTrue(AzureAttribute.InfrastructureEncryptionEnabled)
    .onViolation(Effect.Warn)
    .message('Storage accounts must enable infrastructure encryption')
    .rationale(
      'CIS Azure — a second platform-managed encryption layer at rest ' +
        'depthens data protection',
    ),

  // ── SQL servers (CIS Azure §4) ─────────────────────────────────────────
  rule()
    .resource(AzureResource.MssqlServer)
    .mustBeOneOf(AzureAttribute.MinimumTlsVersion, SqlTlsVersion.V12)
    .message('MSSQL servers must enforce TLS 1.2 minimum')
    .rationale('CIS Azure §4.2 — enforce TLS'),

  // ── Azure SQL admin password must not be hardcoded ────────────────────
  // Cross-cloud parity with `coreSecurity` (AWS db password) + `cisGcp`
  // (Cloud SQL root password). A literal admin password lands in state/VCS.
  rule()
    .resource(AzureResource.MssqlServer)
    .denyLiteral(AzureAttribute.AdministratorLoginPassword)
    .message('Azure SQL admin passwords must be a reference, not a literal')
    .rationale('CIS Azure — no plaintext DB credentials'),

  rule()
    .resource(AzureResource.PostgresqlServer)
    .mustBeTrue(AzureAttribute.SslEnforcementEnabled)
    .message('PostgreSQL servers must enforce SSL connections')
    .rationale('CIS Azure §4.4 — enforce SSL'),

  rule()
    .resource(AzureResource.MysqlFlexibleServer)
    .mustBeTrue(AzureAttribute.SslEnforcementEnabled)
    .message('MySQL servers must enforce SSL connections')
    .rationale('CIS Azure §4.4 — enforce SSL'),

  // ── Cosmos DB (CIS Azure §4) ───────────────────────────────────────────
  rule()
    .id('cosmos-no-local-auth')
    .resource(AzureResource.CosmosdbAccount)
    .mustBeTrue(AzureAttribute.LocalAuthenticationDisabled)
    .onViolation(Effect.Warn)
    .message('Cosmos DB accounts must disable local (key-based) authentication')
    .rationale(
      'CIS Azure — use Entra ID (AAD) identity-based auth; local keys are ' +
        'a long-lived credential surface',
    ),

  // ── Key Vault (CIS Azure §8) ───────────────────────────────────────────
  rule()
    .resource(AzureResource.KeyVault)
    .mustBeTrue(AzureAttribute.PurgeProtectionEnabled)
    .message('Key Vaults must enable purge protection')
    .rationale('CIS Azure §8.4 — purge protection'),

  // ── AKS (CIS Azure §7) ─────────────────────────────────────────────────
  rule()
    .resource(AzureResource.KubernetesCluster)
    .mustBeTrue(AzureAttribute.PrivateClusterEnabled)
    .message('AKS clusters must use a private endpoint')
    .rationale('CIS Azure §7.1 — private API server'),

  rule()
    .resource(AzureResource.KubernetesCluster)
    .mustBeTrue(AzureAttribute.LocalAccountDisabled)
    .message('AKS clusters must disable local accounts')
    .rationale('CIS Azure §7.6 — RBAC-only auth'),

  // ── App Service (CIS Azure §9) ─────────────────────────────────────────
  rule()
    .resource(
      AzureResource.LinuxWebApp,
      AzureResource.WindowsWebApp,
      AzureResource.LinuxFunctionApp,
      AzureResource.WindowsFunctionApp,
    )
    .mustBeTrue(AzureAttribute.HttpsOnly)
    .message('App Services must enforce HTTPS-only')
    .rationale('CIS Azure §9.3 — redirect HTTP to HTTPS'),

  rule()
    .id('app-service-min-tls')
    .resource(
      AzureResource.LinuxWebApp,
      AzureResource.WindowsWebApp,
      AzureResource.LinuxFunctionApp,
      AzureResource.WindowsFunctionApp,
    )
    .mustBeOneOf(AzureAttribute.SiteConfigMinTlsVersion, SqlTlsVersion.V12)
    .onViolation(Effect.Warn)
    .message('App Services must enforce TLS 1.2 minimum')
    .rationale('CIS Azure §9.2 — reject weak TLS'),

  // ── Container Registry (CIS Azure) ─────────────────────────────────────
  rule()
    .resource(AzureResource.ContainerRegistry)
    .mustBeFalse(AzureAttribute.AdminEnabled)
    .message('Container registries must disable admin user')
    .rationale('CIS Azure — no admin on ACR'),

  // ── RBAC least privilege ───────────────────────────────────────────────
  rule()
    .resource(AzureResource.RoleAssignment)
    .denyValue(AzureAttribute.RoleDefinitionName, BuiltInRole.Owner)
    .message('Role assignments must not grant Owner')
    .rationale('CIS Azure — least privilege'),

  rule()
    .resource(AzureResource.RoleAssignment)
    .denyValue(AzureAttribute.RoleDefinitionName, BuiltInRole.Contributor)
    .message('Role assignments must not grant Contributor')
    .rationale('CIS Azure — least privilege'),

  // ── Graph-layer rule (doc 10): no VM directly reachable to a public IP ──
  // The Azure analog of "no DB in a public subnet". The graph traverses
  // VM → network_interface_ids → NIC → ip_configuration.public_ip_address_id
  // → public IP. Internet-facing VMs are legitimate for bastions/jumpboxes,
  // so this is a WARN (visibility for review), not a block.
  rule()
    .id('no-vm-public-ip-reachable')
    .resource(
      AzureResource.LinuxVirtualMachine,
      AzureResource.WindowsVirtualMachine,
      AzureResource.VirtualMachine,
    )
    .denyIfReachable(AzureResource.PublicIp)
    .onViolation(Effect.Warn)
    .message('Virtual machine is reachable to a public IP address')
    .rationale(
      'Internet-facing VMs expand the attack surface — bastions should be ' +
        'isolated behind a hardening baseline (NSG, JIT, patching). Review ' +
        'whether this VM genuinely needs a public IP.',
    ),
] as const
