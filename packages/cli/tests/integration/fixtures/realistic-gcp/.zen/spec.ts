import { rule, GcpResource, GcpAttribute, Port, Tag, IamMember, SqlSslMode, Block } from '../../../../../src/index'

export const spec = [
  rule()
    .id('no-public-ssh')
    .resource(GcpResource.ComputeFirewall)
    .denyIngress(Port.SSH, Port.RDP)
    .message('SSH/RDP must not be open to the internet')
    .rationale('CIS GCP §3.1-3.2'),
  rule()
    .id('bucket-public-access-prevention')
    .resource(GcpResource.StorageBucket)
    .mustEqual(GcpAttribute.PublicAccessPrevention, 'enforced')
    .message('GCS buckets must enforce public access prevention')
    .rationale('CIS GCP §5.1'),
  rule()
    .id('bucket-uniform-access')
    .resource(GcpResource.StorageBucket)
    .mustBeTrue(GcpAttribute.UniformBucketLevelAccess)
    .message('GCS buckets must have uniform bucket-level access')
    .rationale('CIS GCP §5.2'),
  rule()
    .id('no-public-iam-members')
    .resource(GcpResource.StorageBucketIamMember)
    .denyValue(GcpAttribute.Member, IamMember.AllUsers, IamMember.AllAuthenticatedUsers)
    .message('Public IAM members are forbidden')
    .rationale('CIS GCP §1.4'),
  rule()
    .id('gke-private-cluster')
    .resource(GcpResource.ContainerCluster)
    .mustBeTrue(GcpAttribute.EnablePrivateNodes)
    .message('GKE clusters must have private nodes')
    .rationale('CIS GCP §7.1'),
  rule()
    .id('gke-no-legacy-abac')
    .resource(GcpResource.ContainerCluster)
    .mustBeFalse(GcpAttribute.EnableLegacyAbac)
    .message('GKE clusters must not use legacy ABAC')
    .rationale('CIS GCP §7.3'),
  rule()
    .id('cloudsql-no-public-ip')
    .resource(GcpResource.SqlDatabaseInstance)
    .mustBeFalse(GcpAttribute.Ipv4Enabled)
    .message('Cloud SQL instances must not have public IP')
    .rationale('CIS GCP §6.1'),
  rule()
    .id('cloudsql-ssl-mode')
    .resource(GcpResource.SqlDatabaseInstance)
    .mustBeOneOf(GcpAttribute.SslMode, SqlSslMode.EncryptedOnly, SqlSslMode.TrustedClientCertRequired)
    .message('Cloud SQL must require SSL')
    .rationale('CIS GCP §6.4'),
  rule()
    .id('kms-rotation')
    .resource(GcpResource.KmsCryptoKey)
    .mustBeSet(GcpAttribute.RotationPeriod)
    .message('KMS keys must have rotation enabled')
    .rationale('CIS GCP §8.1'),
  rule()
    .id('instance-no-public-ip')
    .resource(GcpResource.ComputeInstance)
    .denyBlockPresence(Block.NetworkInterfaceAccessConfig)
    .message('Compute instances must not have public IPs')
    .rationale('CIS GCP §4.1'),
  rule()
    .id('required-labels')
    .resource(GcpResource.StorageBucket, GcpResource.ContainerCluster, GcpResource.SqlDatabaseInstance)
    .mustHaveTags(Tag.Team, Tag.CostCenter, Tag.Environment)
    .message('Required labels: team, cost_center, environment')
    .rationale('Common control: ownership + cost allocation'),
  rule()
    .id('encrypted-state')
    .allResources()
    .requireEncryptedBackend()
    .message('State backend must be encrypted'),
]
