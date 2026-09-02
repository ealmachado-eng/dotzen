import { rule, AzureResource, AzureAttribute, Port, Tag, BuiltInRole } from '../../../../../src/index'

export const spec = [
  rule()
    .id('nsg-no-public-ssh')
    .resource(AzureResource.NetworkSecurityGroup)
    .denyIngress(Port.SSH, Port.RDP)
    .message('SSH/RDP must not be open to the internet')
    .rationale('CIS Azure §6.1-6.2'),
  rule()
    .id('storage-https-only')
    .resource(AzureResource.StorageAccount)
    .mustBeTrue(AzureAttribute.HttpsOnly)
    .message('Storage accounts must be HTTPS-only')
    .rationale('CIS Azure §3.7'),
  rule()
    .id('storage-no-public-blob')
    .resource(AzureResource.StorageAccount)
    .mustBeFalse(AzureAttribute.AllowNestedItemsToBePublic)
    .message('Storage accounts must not allow public blob access')
    .rationale('CIS Azure §3.5'),
  rule()
    .id('storage-min-tls')
    .resource(AzureResource.StorageAccount)
    .mustEqual(AzureAttribute.MinTlsVersion, 'TLS1_2')
    .message('Storage accounts must enforce TLS 1.2')
    .rationale('CIS Azure §3.10'),
  rule()
    .id('keyvault-purge-protection')
    .resource(AzureResource.KeyVault)
    .mustBeTrue(AzureAttribute.PurgeProtectionEnabled)
    .message('Key Vault must have purge protection enabled')
    .rationale('CIS Azure §8.6'),
  rule()
    .id('aks-private-cluster')
    .resource(AzureResource.KubernetesCluster)
    .mustBeTrue(AzureAttribute.PrivateClusterEnabled)
    .message('AKS clusters must be private')
    .rationale('CIS Azure §7.1'),
  rule()
    .id('sql-min-tls')
    .resource(AzureResource.MssqlServer)
    .mustEqual(AzureAttribute.MinimumTlsVersion, '1.2')
    .message('SQL servers must enforce TLS 1.2')
    .rationale('CIS Azure §4.1.1'),
  rule()
    .id('sql-no-hardcoded-password')
    .resource(AzureResource.MssqlServer)
    .denyLiteral(AzureAttribute.AdministratorLoginPassword)
    .message('SQL admin password must not be hardcoded')
    .rationale('Common control: no plaintext secrets'),
  rule()
    .id('rbac-no-contributor')
    .resource(AzureResource.RoleAssignment)
    .denyValue(AzureAttribute.RoleDefinitionName, BuiltInRole.Contributor)
    .message('Contributor role is too broad — use least privilege')
    .rationale('CIS Azure §9.1'),
  rule()
    .id('required-tags')
    .resource(AzureResource.StorageAccount, AzureResource.KeyVault, AzureResource.KubernetesCluster, AzureResource.LinuxWebApp)
    .mustHaveTags(Tag.Team, Tag.CostCenter, Tag.Environment)
    .message('Required tags: team, cost_center, environment')
    .rationale('Common control: ownership + cost allocation'),
  rule()
    .id('encrypted-state')
    .allResources()
    .requireEncryptedBackend()
    .message('State backend must be encrypted'),
]
