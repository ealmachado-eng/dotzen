/**
 * CIS AWS Foundations — AWS-specific additions on top of `coreSecurity`.
 *
 * The shared controls (network exposure, encryption of RDS/EBS/EC2, IAM
 * least privilege, CloudTrail KMS + multi-region, no hardcoded secrets,
 * required tags, provisioner denial, backup retention ≥7) live in
 * `coreSecurity`. This pack adds only the AWS-specific CIS controls not
 * covered by the shared base.
 *
 * Usage:
 *   import { coreSecurity, cisAws } from '@erkos/pluvian'
 *   export const spec = [...coreSecurity, ...cisAws, /* your rules *\/]
 *
 * To compose CIS + PCI (no duplicate violations):
 *   import { coreSecurity, cisAws, pciDss } from '@erkos/pluvian'
 *   export const spec = [...coreSecurity, ...cisAws, ...pciDss]
 */
import { rule } from '../spec/rule'
import { AwsResource, AwsAttribute, Block, Port, Effect } from '../vocabulary'

export const cisAws = [
  // ── CloudTrail log file validation (CIS §3.4 — not in core) ────────────
  rule()
    .resource(AwsResource.Cloudtrail)
    .mustBeTrue(AwsAttribute.EnableLogFileValidation)
    .message('CloudTrail must enable log file validation')
    .rationale('CIS AWS v1.4 §3.4 — log file integrity'),

  // ── Additional encryption-at-rest (CIS §3 — not in core) ───────────────
  rule()
    .resource(AwsResource.RedshiftCluster)
    .mustBeTrue(AwsAttribute.Encrypted)
    .message('Redshift clusters must be encrypted')
    .rationale('CIS AWS — encrypt Redshift at rest'),

  rule()
    .resource(AwsResource.ElasticacheReplicationGroup)
    .mustBeTrue(AwsAttribute.AtRestEncryptionEnabled)
    .message('ElastiCache replication groups must encrypt at rest')
    .rationale('CIS AWS — encrypt ElastiCache'),

  rule()
    .resource(AwsResource.ElasticacheReplicationGroup)
    .mustBeTrue(AwsAttribute.TransitEncryptionEnabled)
    .onViolation(Effect.Warn)
    .message('ElastiCache replication groups must enable transit encryption')
    .rationale('CIS AWS — encrypt Redis traffic in transit'),

  // ── OpenSearch enforce HTTPS at the domain endpoint ───────────────────
  rule()
    .id('opensearch-enforce-https')
    .resource(AwsResource.OpensearchDomain)
    .mustBeTrue(AwsAttribute.OpenSearchEnforceHttps)
    .onViolation(Effect.Warn)
    .message('OpenSearch domains must enforce HTTPS on the endpoint')
    .rationale('CIS AWS — reject plaintext access to the domain endpoint'),

  // ── S3 block public ACLs (CIS §2 — core has denyAcl, this adds the block) ─
  rule()
    .resource(AwsResource.S3Bucket)
    .mustBeTrue(AwsAttribute.BlockPublicAcls)
    .message('S3 buckets must block public ACLs')
    .rationale('CIS AWS — enable block_public_acls'),

  // ── RDS/Aurora/DocDB not publicly accessible (CIS §3 — not in core) ────
  // Cluster instances (`aws_rds_cluster_instance`, `aws_docdb_cluster_instance`)
  // carry `publicly_accessible` too — covered alongside `aws_db_instance`.
  rule()
    .resource(
      AwsResource.DbInstance,
      AwsResource.RdsClusterInstance,
      AwsResource.DocdbClusterInstance,
    )
    .mustBeFalse(AwsAttribute.PubliclyAccessible)
    .message('RDS/Aurora/DocDB instances must not be publicly accessible')
    .rationale('CIS AWS — no public DB endpoint'),

  // ── ECR image scanning (CIS — not in core) ─────────────────────────────
  rule()
    .resource(AwsResource.EcrRepository)
    .mustBeTrue(AwsAttribute.ImageScanOnPush)
    .message('ECR repositories must scan images on push')
    .rationale('CIS — supply-chain: scan on push'),

  // ── EKS node group: no direct SSH (use SSM Session Manager) ───────────
  rule()
    .id('eks-nodegroup-no-ssh')
    .resource(AwsResource.EksNodeGroup)
    .denyBlockPresence(Block.RemoteAccess)
    .message(
      'EKS node groups must not enable remote_access (use SSM Session Manager)',
    )
    .rationale('CIS AWS — no direct SSH to nodes; SSM provides audited access'),

  // ── S3 access logging (CIS §2.6 — not in core) ────────────────────────
  rule()
    .id('s3-access-logging')
    .resource(AwsResource.S3Bucket)
    .mustHaveAssociated(AwsResource.S3BucketLogging, AwsAttribute.Bucket)
    .onViolation(Effect.Warn)
    .message('S3 buckets must have access logging enabled')
    .rationale('CIS AWS §2.6 — log all access to S3 buckets'),

  // ── ALB access logging (CIS — not in core) ───────────────────────────
  rule()
    .id('alb-access-logging')
    .resource(AwsResource.Lb)
    .mustBeTrue(AwsAttribute.AccessLogsEnabled)
    .onViolation(Effect.Warn)
    .message('Load balancers must enable access logs')
    .rationale('CIS AWS — log all load balancer traffic for audit'),

  // ── S3 bucket versioning (CIS — not in core) ─────────────────────────
  rule()
    .id('s3-versioning')
    .resource(AwsResource.S3Bucket)
    .mustHaveAssociated(AwsResource.S3BucketVersioning, AwsAttribute.Bucket)
    .onViolation(Effect.Warn)
    .message('S3 buckets must have versioning enabled')
    .rationale('CIS AWS — data durability and ransomware recovery'),

  // ── ECR lifecycle policy (CIS — not in core) ─────────────────────────
  rule()
    .id('ecr-lifecycle-policy')
    .resource(AwsResource.EcrRepository)
    .mustHaveAssociated(AwsResource.EcrLifecyclePolicy, AwsAttribute.Repository)
    .onViolation(Effect.Warn)
    .message('ECR repositories must have a lifecycle policy')
    .rationale(
      'CIS AWS — image retention/cleanup prevents stale vulnerable images',
    ),

  // ── WAFv2 Web ACL on ALB (CIS — not in core) ────────────────────────
  rule()
    .id('alb-waf-association')
    .resource(AwsResource.Lb)
    .mustHaveAssociated(
      AwsResource.Wafv2WebAclAssociation,
      AwsAttribute.ResourceArn,
    )
    .onViolation(Effect.Warn)
    .message('Load balancers must have a WAF Web ACL associated')
    .rationale('CIS AWS — protect load balancers with WAF rules'),

  // ── IAM Access Analyzer enabled (CIS §2.4 — account-level presence) ──
  rule()
    .id('require-access-analyzer')
    .allResources()
    .requireResource(AwsResource.AccessAnalyzer)
    .onViolation(Effect.Warn)
    .message('An IAM Access Analyzer must be declared in the project')
    .rationale(
      'CIS AWS v1.4 §2.4 — Access Analyzer monitors for unintended resource ' +
        'access across the account/organization; its presence is required',
    ),

  // ── Network ACL no public SSH/RDP (subnet-edge firewall) ─────────────
  // NACLs are stateless subnet-level firewalls. A public SSH/RDP allow at
  // the subnet edge is an ingress opening that bypasses SG controls — same
  // risk the SG denyIngress rule catches one layer up. Covers both the
  // standalone `aws_network_acl_rule` and inline `aws_network_acl` ingress
  // blocks (normalize maps both into the cloud-neutral `ingress` field, so
  // the existing `denyIngress` condition governs them unchanged).
  rule()
    .id('nacl-no-public-ssh-rdp')
    .resource(AwsResource.NetworkAcl, AwsResource.NetworkAclRule)
    .denyIngress(Port.SSH, Port.RDP)
    .onViolation(Effect.Warn)
    .message('Network ACLs must not allow public SSH/RDP ingress')
    .rationale(
      'NACLs are stateless subnet firewalls — public SSH/RDP at the subnet ' +
        'edge is the same risk the SG rule catches one layer up',
    ),

  // ── Secrets Manager resource policy must not grant public access ──────
  // A secret whose resource policy grants `Principal: "*"` is readable by
  // anyone (the resource-policy analog of an S3 bucket going public). The
  // existing `denyPublicPrincipal` condition (which parses the inline
  // `policy` via `policyOf` and flags an Allow + Principal "*") governs it
  // unchanged — same code path as the IAM-policy rule in core-security.
  rule()
    .id('no-public-secret-policy')
    .resource(AwsResource.SecretsmanagerSecretPolicy)
    .denyPublicPrincipal()
    .message(
      'Secret resource policies must not grant Principal "*" (public access)',
    )
    .rationale(
      'A secret with a public resource policy is a catastrophic leak — ' +
        'restrict to a specific role/account instead',
    ),

  // ── Graph-layer rules (doc 10): topology-aware controls ───────────────
  // These use the v2 dependency-graph (multi-hop reference traversal) to
  // catch controls that per-resource evaluation cannot express.

  // No database in a public subnet — the #1 cloud misconfig. The graph
  // traverses: db → subnet → route_table_association → route_table → route
  // → internet_gateway. If that chain reaches an IGW, the DB is public.
  rule()
    .id('no-db-in-public-subnet')
    .resource(AwsResource.DbInstance)
    .denyIfReachable(AwsResource.InternetGateway)
    .message(
      'Database instances must not be in a public subnet (reachable to an Internet Gateway)',
    )
    .rationale(
      'CIS AWS — isolate data stores from direct internet access. ' +
        'A DB reachable to an IGW is exposed to the internet.',
    ),

  // No shared security group between a DB and a public load balancer.
  // Lateral-movement prevention — a shared SG bridges trust boundaries.
  rule()
    .id('no-sg-shared-lb-db')
    .resource(AwsResource.DbInstance)
    .denyIfSharedWith(AwsResource.SecurityGroup, AwsResource.Lb)
    .onViolation(Effect.Warn)
    .message('DB security groups should not be shared with load balancers')
    .rationale(
      'Trust-boundary isolation — a shared SG enables lateral movement ' +
        'between a public LB and a private DB tier',
    ),
] as const
