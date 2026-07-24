import {
  rule,
  AwsResource,
  Port,
  Tag,
  AwsAttribute,
  Acl,
  Environment,
  Effect,
  Approver,
  HttpTokens,
  Cidr,
  EksLogType,
  TlsPolicy,
  Block,
  Wildcard,
  ApiGatewayAuthorization,
  XrayMode,
  AzureResource,
  AzureAttribute,
  StorageTlsVersion,
  SqlTlsVersion,
  BuiltInRole,
  NetworkDefaultAction,
  GcpResource,
  GcpAttribute,
  PublicAccessPreventionMode,
  IamMember,
  PrimitiveRole,
  OauthScope,
  SqlSslMode,
  IngressSetting,
} from '../../../src/index'

export const spec = [
  rule()
    .resource(AwsResource.SecurityGroup)
    .denyIngress(Port.SSH, Port.RDP)
    .message('SSH and RDP must not be open to the internet')
    .rationale('CIS AWS Foundations Benchmark v1.4, control 5.2'),

  // Scoped to taggable resource types (not .allResources(), which would
  // also flag decomposed sub-resources like aws_s3_bucket_acl that carry
  // no meaningful tags).
  rule()
    .resource(
      AwsResource.SecurityGroup,
      AwsResource.DbInstance,
      AwsResource.S3Bucket,
    )
    .mustHaveTags(Tag.Team, Tag.CostCenter, Tag.Environment)
    .message('Required tags missing: team, cost_center, environment')
    .rationale('FinOps ownership + cost allocation policy'),

  rule()
    .resource(AwsResource.DbInstance)
    .mustBeTrue(AwsAttribute.StorageEncrypted)
    .message('RDS instances must have storage encryption at rest')
    .rationale('LGPD/PCI-DSS data-at-rest protection'),

  rule()
    .resource(AwsResource.DbInstance)
    .denyWhenTrue(AwsAttribute.PubliclyAccessible)
    .message('RDS instances must not be publicly accessible')
    .rationale('Databases must not be reachable from the public internet'),

  rule()
    .resource(AwsResource.S3Bucket)
    .denyAcl(Acl.PublicRead, Acl.PublicReadWrite)
    .message('S3 buckets must not have a public ACL')
    .rationale('Public buckets are a leading cause of data exposure'),

  // Environment-scoped: only applies to resources tagged environment=production.
  rule()
    .resource(AwsResource.DbInstance)
    .environment(Environment.Production)
    .mustBeTrue(AwsAttribute.DeletionProtection)
    .message('Production RDS instances must have deletion protection')
    .rationale('Prevents accidental destruction of production data'),

  // require_approval: does not block, but pauses the pipeline for sign-off.
  rule()
    .resource(AwsResource.DbInstance)
    .environment(Environment.Production)
    .mustBeTrue(AwsAttribute.MultiAz)
    .onViolation(Effect.RequireApproval)
    .approvers(Approver.PlatformTeam, Approver.SRE)
    .message('Production RDS without Multi-AZ requires sign-off')
    .rationale('Availability review for single-AZ production databases'),

  // ── Tier 1: encryption at rest + public-access lockdown ──────────────
  rule()
    .resource(AwsResource.S3BucketPublicAccessBlock)
    .mustBeTrue(
      AwsAttribute.BlockPublicAcls,
      AwsAttribute.BlockPublicPolicy,
      AwsAttribute.IgnorePublicAcls,
      AwsAttribute.RestrictPublicBuckets,
    )
    .message('S3 public access block must deny all public access')
    .rationale('CIS AWS Foundations Benchmark, S3 public access'),

  rule()
    .resource(AwsResource.EbsVolume, AwsResource.EfsFileSystem)
    .mustBeTrue(AwsAttribute.Encrypted)
    .message('EBS volumes and EFS file systems must be encrypted at rest'),

  rule()
    .resource(AwsResource.KmsKey)
    .mustBeTrue(AwsAttribute.EnableKeyRotation)
    .message('KMS keys must have automatic key rotation enabled')
    .rationale('CIS AWS Foundations Benchmark 3.8'),

  rule()
    .resource(AwsResource.SecurityGroup)
    .denyEgress(Port.Postgres, Port.MySQL)
    .message('Database ports must not egress to the internet'),

  // ── Tier 2: nested-block attributes + numeric thresholds ─────────────
  rule()
    .resource(AwsResource.Instance)
    .mustEqual(AwsAttribute.HttpTokens, HttpTokens.Required)
    .message('EC2 instances must require IMDSv2 (metadata http_tokens)')
    .rationale('Prevents SSRF-based credential theft; CIS EC2'),

  rule()
    .resource(AwsResource.Instance)
    .mustBeTrue(AwsAttribute.RootBlockDeviceEncrypted)
    .message('EC2 root block devices must be encrypted'),

  rule()
    .resource(AwsResource.Instance)
    .denyWhenTrue(AwsAttribute.AssociatePublicIpAddress)
    .message('EC2 instances must not auto-assign a public IP'),

  rule()
    .resource(AwsResource.DynamodbTable)
    .mustBeTrue(AwsAttribute.ServerSideEncryptionEnabled)
    .message('DynamoDB tables must have server-side encryption enabled'),

  rule()
    .resource(AwsResource.EcrRepository)
    .mustBeTrue(AwsAttribute.ImageScanOnPush)
    .message('ECR repositories must scan images on push'),

  rule()
    .resource(AwsResource.DbInstance)
    .mustBeAtLeast(AwsAttribute.BackupRetentionPeriod, 7)
    .message('RDS backup retention must be at least 7 days'),

  // ── Tier 3: IAM over-permission (also covers S3 bucket policies) ─────
  rule()
    .resource(
      AwsResource.IamPolicy,
      AwsResource.IamRolePolicy,
      AwsResource.S3Bucket,
      AwsResource.S3BucketPolicy,
    )
    .denyIamWildcard()
    .message('Policies must not grant full Action "*" privileges')
    .rationale('Least privilege; CIS AWS Foundations, IAM'),

  // S3 bucket policies must not grant public access (Principal "*" in Allow).
  rule()
    .resource(
      AwsResource.IamPolicy,
      AwsResource.IamRolePolicy,
      AwsResource.S3BucketPolicy,
    )
    .denyPublicPrincipal()
    .message('Policies must not grant public access (Principal "*")')
    .rationale('CIS AWS — no public Principal in Allow statements'),

  // S3 bucket policies must deny non-SSL transport (CIS AWS — reject HTTP).
  // Uses the Condition-block parsing from the jsonencode work.
  rule()
    .resource(AwsResource.S3BucketPolicy)
    .requireSslOnlyPolicy()
    .message('S3 bucket policies must deny non-SSL transport')
    .rationale(
      'CIS AWS — bucket policies should reject HTTP (aws:SecureTransport=false)',
    ),

  // ── ECS / EKS / ALB service posture ──────────────────────────────────
  rule()
    .resource(AwsResource.EcsService)
    .denyWhenTrue(AwsAttribute.AssignPublicIp)
    .message('ECS services must not assign public IPs to tasks'),

  rule()
    .resource(AwsResource.EksCluster)
    .mustBeFalse(AwsAttribute.EndpointPublicAccess)
    .message('EKS cluster API endpoint must not be publicly accessible')
    .rationale('A public control-plane endpoint is exposed to the internet'),

  rule()
    .resource(AwsResource.EksCluster)
    .listContains(
      AwsAttribute.PublicAccessCidrs,
      Cidr.Internet,
      Cidr.InternetV6,
    )
    .message('EKS public_access_cidrs must not allow the whole internet'),

  rule()
    .resource(AwsResource.EksCluster)
    .listMustInclude(
      AwsAttribute.EnabledClusterLogTypes,
      EksLogType.Api,
      EksLogType.Audit,
    )
    .message('EKS must enable api + audit control-plane logging')
    .rationale('CIS EKS — control-plane audit logging'),

  rule()
    .resource(AwsResource.EksCluster)
    .mustHaveBlock(Block.EncryptionConfig)
    .message('EKS clusters must configure secrets envelope encryption')
    .rationale('encryption_config with a KMS key protects Kubernetes secrets'),

  rule()
    .resource(AwsResource.Lb)
    .mustBeTrue(AwsAttribute.AccessLogsEnabled)
    .message('Load balancers must have access logging enabled'),

  rule()
    .resource(AwsResource.Lb)
    .mustBeTrue(AwsAttribute.DropInvalidHeaderFields)
    .message('ALBs must drop invalid HTTP header fields'),

  rule()
    .resource(AwsResource.LbListener)
    .denyValue(
      AwsAttribute.SslPolicy,
      TlsPolicy.Legacy2015,
      TlsPolicy.Tls10,
      TlsPolicy.Tls11,
    )
    .message('Listeners must not use a weak (TLS 1.0/1.1) policy')
    .rationale('TLS downgrade exposure'),

  rule()
    .resource(AwsResource.LbListener)
    .denyPlaintextListener()
    .message('Listeners must not serve plaintext (use HTTPS/TLS, or redirect)'),

  rule()
    .resource(AwsResource.EcsTaskDefinition)
    .denyPrivilegedContainers()
    .message('ECS task definitions must not run privileged containers'),

  rule()
    .resource(AwsResource.EcsTaskDefinition)
    .denyPlaintextEnvSecrets()
    .message('ECS environment variables must not contain plaintext secrets')
    .rationale(
      'Use Secrets Manager / SSM Parameter Store references, not hardcoded values',
    ),

  // ── Hardcoded secrets (literal-vs-reference) ─────────────────────────
  rule()
    .resource(AwsResource.SecretsmanagerSecretVersion)
    .denyLiteral(AwsAttribute.SecretString)
    .message('Secret values must be a reference (var/data), never hardcoded')
    .rationale('A literal secret ends up in the Terraform state and VCS'),

  rule()
    .resource(AwsResource.DbInstance)
    .denyLiteral(AwsAttribute.Password)
    .message('RDS master password must not be hardcoded'),

  rule()
    .resource(AwsResource.RdsCluster, AwsResource.RedshiftCluster)
    .denyLiteral(AwsAttribute.MasterPassword)
    .message('Cluster master password must not be hardcoded'),

  rule()
    .resource(AwsResource.ElasticacheReplicationGroup)
    .denyLiteral(AwsAttribute.AuthToken)
    .message('ElastiCache auth token must not be hardcoded'),

  // ── Cross-resource presence ──────────────────────────────────────────
  // Modern AWS provider style splits encryption/versioning/rotation into
  // their own resources; these rules require that companion resource to
  // exist and point back at the parent.
  rule()
    .resource(AwsResource.S3Bucket)
    .mustHaveAssociated(
      AwsResource.S3BucketServerSideEncryptionConfiguration,
      AwsAttribute.Bucket,
    )
    .message('S3 buckets must have server-side encryption configured')
    .rationale('A bucket with no SSE-config resource stores data unencrypted'),

  rule()
    .resource(AwsResource.S3Bucket)
    .mustHaveAssociated(AwsResource.S3BucketVersioning, AwsAttribute.Bucket)
    .onViolation(Effect.Warn)
    .message('S3 buckets should have versioning enabled'),

  rule()
    .resource(AwsResource.SecretsmanagerSecret)
    .mustHaveAssociated(
      AwsResource.SecretsmanagerSecretRotation,
      AwsAttribute.SecretId,
    )
    .onViolation(Effect.Warn)
    .message('Secrets Manager secrets should have automatic rotation'),

  // ── VPC exposure + auditability ──────────────────────────────────────
  rule()
    .resource(AwsResource.Vpc)
    .mustHaveAssociated(AwsResource.FlowLog, AwsAttribute.VpcId)
    .onViolation(Effect.Warn)
    .message('VPCs should have flow logging enabled')
    .rationale('Flow logs give network forensics/audit trail; CIS AWS'),

  rule()
    .resource(AwsResource.Subnet)
    .denyWhenTrue(AwsAttribute.MapPublicIpOnLaunch)
    .message('Subnets must not auto-assign public IPs on launch')
    .rationale('map_public_ip_on_launch exposes every instance in the subnet'),

  rule()
    .resource(AwsResource.Subnet)
    .denyWhenTrue(AwsAttribute.AssignIpv6AddressOnCreation)
    .onViolation(Effect.Warn)
    .message('Subnets should not auto-assign IPv6 addresses on creation'),

  // ── CloudTrail (audit logging — CIS AWS §3) ──────────────────────────
  rule()
    .resource(AwsResource.Cloudtrail)
    .mustBeTrue(
      AwsAttribute.IsMultiRegionTrail,
      AwsAttribute.EnableLogFileValidation,
    )
    .message('CloudTrail must be multi-region with log-file validation')
    .rationale('CIS AWS §3.1–3.2 — tamper-evident, all-region audit trail'),

  rule()
    .resource(AwsResource.Cloudtrail)
    .mustBeSet(AwsAttribute.KmsKeyId)
    .message('CloudTrail logs must be encrypted with a KMS key')
    .rationale('CIS AWS §3.7 — SSE-KMS on the trail'),

  // ── AWS Config (CIS AWS §3.1-3.2) ────────────────────────────────────
  rule()
    .resource(AwsResource.ConfigConfigurationRecorder)
    .mustBeTrue(AwsAttribute.RecordingGroupAllSupported)
    .message('AWS Config must record all supported resource types')
    .rationale('CIS AWS §3.1 — Config should cover all resource types'),

  rule()
    .resource(AwsResource.ConfigConfigurationRecorder)
    .mustBeTrue(AwsAttribute.RecordingGroupIncludeGlobalResourceTypes)
    .message('AWS Config must include global resource types (IAM)')
    .rationale('CIS AWS §3.2 — Config should record global resources'),

  // ── IAM account password policy (CIS AWS §1.8–1.9) ───────────────────
  rule()
    .resource(AwsResource.IamAccountPasswordPolicy)
    .mustBeAtLeast(AwsAttribute.MinimumPasswordLength, 14)
    .message('IAM password policy must require at least 14 characters'),

  rule()
    .resource(AwsResource.IamAccountPasswordPolicy)
    .mustBeTrue(
      AwsAttribute.RequireSymbols,
      AwsAttribute.RequireNumbers,
      AwsAttribute.RequireUppercaseCharacters,
      AwsAttribute.RequireLowercaseCharacters,
    )
    .message('IAM password policy must require full character complexity'),

  rule()
    .resource(AwsResource.IamAccountPasswordPolicy)
    .mustBeAtLeast(AwsAttribute.PasswordReusePrevention, 24)
    .message('IAM password policy must prevent reuse of the last 24 passwords'),

  rule()
    .resource(AwsResource.IamAccountPasswordPolicy)
    .mustBeAtMost(AwsAttribute.MaxPasswordAge, 90)
    .message('IAM password policy must expire passwords within 90 days'),

  // ── API Gateway (beyond CIS L1; Well-Architected security) ───────────
  rule()
    .resource(AwsResource.ApiGatewayMethod)
    .denyValue(AwsAttribute.Authorization, ApiGatewayAuthorization.None)
    .onViolation(Effect.Warn)
    .message('API Gateway methods should require authorization (not NONE)')
    .rationale('Unauthenticated methods are public; CORS OPTIONS excepted'),

  rule()
    .resource(AwsResource.ApiGatewayStage, AwsResource.Apigatewayv2Stage)
    .mustHaveBlock(Block.AccessLogSettings)
    .onViolation(Effect.Warn)
    .message('API Gateway stages should enable access logging'),

  rule()
    .resource(AwsResource.ApiGatewayStage)
    .mustBeTrue(AwsAttribute.XrayTracingEnabled)
    .onViolation(Effect.Warn)
    .message('API Gateway stages should enable X-Ray tracing'),

  // ── AWS Lambda (serverless) ───────────────────────────────────────────
  rule()
    .resource(AwsResource.LambdaFunction)
    .mustEqual(AwsAttribute.TracingMode, XrayMode.Active)
    .onViolation(Effect.Warn)
    .message('Lambda functions should enable X-Ray active tracing')
    .rationale('Tracing gives request-level observability across downstream calls'),

  rule()
    .resource(AwsResource.LambdaFunction)
    .mustBeSet(AwsAttribute.LambdaKmsKeyArn)
    .onViolation(Effect.Warn)
    .message('Lambda functions should encrypt environment variables with a customer KMS key')
    .rationale('Without a KMS key, env vars use AWS-managed encryption only'),

  rule()
    .resource(AwsResource.LambdaFunction)
    .denyPlaintextEnvSecrets()
    .message('Lambda environment variables must not contain plaintext secrets')
    .rationale(
      'Use Secrets Manager / SSM Parameter Store references, not hardcoded values',
    ),

  rule()
    .resource(
      AwsResource.LambdaFunction,
      AzureResource.LinuxFunctionApp,
      AzureResource.WindowsFunctionApp,
      AzureResource.FunctionApp,
      GcpResource.Cloudfunctions2Function,
    )
    .mustHaveTags(Tag.Team, Tag.CostCenter, Tag.Environment)
    .message('Serverless functions must carry ownership tags')
    .rationale('FinOps ownership + cost allocation policy'),

  // ═══ Azure (azurerm) — same conditions, provider-specific vocabulary ══
  rule()
    .resource(
      AzureResource.NetworkSecurityGroup,
      AzureResource.NetworkSecurityRule,
    )
    .denyIngress(Port.SSH, Port.RDP)
    .message('Azure NSGs must not allow SSH/RDP inbound from the internet')
    .rationale('CIS Azure — restrict inbound management ports'),

  rule()
    .resource(AzureResource.StorageAccount)
    .mustBeFalse(AzureAttribute.AllowNestedItemsToBePublic)
    .message('Storage accounts must not allow public blob access')
    .rationale('allow_nested_items_to_be_public defaults to true'),

  rule()
    .resource(AzureResource.StorageAccount)
    .mustEqual(AzureAttribute.MinTlsVersion, StorageTlsVersion.Tls12)
    .message('Storage accounts must require TLS 1.2'),

  rule()
    .resource(AzureResource.StorageAccount)
    .denyWhenTrue(AzureAttribute.PublicNetworkAccessEnabled)
    .onViolation(Effect.Warn)
    .message('Storage accounts should disable public network access'),

  rule()
    .resource(
      AzureResource.StorageAccount,
      AzureResource.MssqlServer,
      AzureResource.KeyVault,
    )
    .mustHaveTags(Tag.Team, Tag.CostCenter, Tag.Environment)
    .message('Azure resources must carry ownership tags'),

  rule()
    .resource(AzureResource.MssqlServer)
    .denyLiteral(AzureAttribute.AdministratorLoginPassword)
    .message('SQL admin password must be a reference, never hardcoded'),

  rule()
    .resource(AzureResource.MssqlServer)
    .denyValue(
      AzureAttribute.MinimumTlsVersion,
      SqlTlsVersion.V10,
      SqlTlsVersion.V11,
    )
    .message('SQL servers must not accept TLS 1.0/1.1'),

  rule()
    .resource(AzureResource.MssqlServer)
    .denyWhenTrue(AzureAttribute.PublicNetworkAccessEnabled)
    .onViolation(Effect.Warn)
    .message('SQL servers should disable public network access'),

  rule()
    .resource(AzureResource.KeyVault)
    .mustBeTrue(AzureAttribute.PurgeProtectionEnabled)
    .message('Key Vaults must enable purge protection'),

  rule()
    .resource(AzureResource.KubernetesCluster)
    .mustBeTrue(AzureAttribute.PrivateClusterEnabled)
    .onViolation(Effect.Warn)
    .message('AKS clusters should be private'),

  rule()
    .resource(AzureResource.KubernetesCluster)
    .mustBeTrue(AzureAttribute.LocalAccountDisabled)
    .onViolation(Effect.Warn)
    .message('AKS clusters should disable local accounts (use Azure AD)'),

  // Azure CIS L1: transport security, private access, no built-in admin.
  rule()
    .resource(AzureResource.LinuxWebApp, AzureResource.WindowsWebApp)
    .mustBeTrue(AzureAttribute.HttpsOnly)
    .message('App Service must enforce HTTPS-only')
    .rationale('https_only defaults to false — plaintext HTTP is allowed'),

  // Azure Functions (serverless) — HTTPS, TLS floor, public access,
  // managed identity, env-var secrets, and diagnostic logging.
  rule()
    .resource(
      AzureResource.LinuxFunctionApp,
      AzureResource.WindowsFunctionApp,
      AzureResource.FunctionApp,
    )
    .mustBeTrue(AzureAttribute.HttpsOnly)
    .message('Azure Functions must enforce HTTPS-only')
    .rationale('https_only defaults to false — plaintext HTTP is allowed'),

  rule()
    .resource(
      AzureResource.LinuxFunctionApp,
      AzureResource.WindowsFunctionApp,
      AzureResource.FunctionApp,
    )
    .mustEqual(AzureAttribute.SiteConfigMinTlsVersion, SqlTlsVersion.V12)
    .onViolation(Effect.Warn)
    .message('Azure Functions should require TLS 1.2 (site_config.minimum_tls_version)'),

  rule()
    .resource(
      AzureResource.LinuxFunctionApp,
      AzureResource.WindowsFunctionApp,
      AzureResource.FunctionApp,
    )
    .denyWhenTrue(AzureAttribute.PublicNetworkAccessEnabled)
    .onViolation(Effect.Warn)
    .message('Azure Functions should disable public network access'),

  rule()
    .resource(
      AzureResource.LinuxFunctionApp,
      AzureResource.WindowsFunctionApp,
      AzureResource.FunctionApp,
    )
    .mustHaveBlock(Block.Identity)
    .onViolation(Effect.Warn)
    .message('Azure Functions should use a managed identity (identity {} block)')
    .rationale('A managed identity replaces shared/local credentials with AAD'),

  rule()
    .resource(
      AzureResource.LinuxFunctionApp,
      AzureResource.WindowsFunctionApp,
      AzureResource.FunctionApp,
    )
    .denyPlaintextEnvSecrets()
    .message('Azure Functions app_settings must not contain plaintext secrets')
    .rationale('Use Key Vault / SSM-style references, not hardcoded values'),

  rule()
    .resource(
      AzureResource.LinuxFunctionApp,
      AzureResource.WindowsFunctionApp,
      AzureResource.FunctionApp,
    )
    .mustHaveAssociated(
      AzureResource.MonitorDiagnosticSetting,
      AzureAttribute.TargetResourceId,
    )
    .onViolation(Effect.Warn)
    .message('Azure Functions should have diagnostic logging configured'),

  rule()
    .resource(AzureResource.PostgresqlServer, AzureResource.MysqlServer)
    .mustBeTrue(AzureAttribute.SslEnforcementEnabled)
    .message('Database servers must enforce SSL connections'),

  rule()
    .resource(AzureResource.PostgresqlServer, AzureResource.MysqlServer)
    .denyWhenTrue(AzureAttribute.PublicNetworkAccessEnabled)
    .onViolation(Effect.Warn)
    .message('Database servers should disable public network access'),

  rule()
    .resource(AzureResource.ContainerRegistry)
    .denyWhenTrue(AzureAttribute.AdminEnabled)
    .message('Container Registry must not enable the built-in admin user')
    .rationale('The admin account is a shared credential; use AAD/tokens'),

  rule()
    .resource(AzureResource.CosmosdbAccount)
    .denyWhenTrue(AzureAttribute.PublicNetworkAccessEnabled)
    .onViolation(Effect.Warn)
    .message('Cosmos DB accounts should disable public network access'),

  // Azure RBAC over-permission (the analog of an AWS Action:"*" wildcard).
  rule()
    .resource(AzureResource.RoleDefinition)
    .listContains(AzureAttribute.RoleActions, Wildcard.All)
    .message('Custom roles must not grant all actions ("*")')
    .rationale('Least privilege; a wildcard action role is effectively admin'),

  rule()
    .resource(AzureResource.RoleAssignment)
    .denyValue(AzureAttribute.RoleDefinitionName, BuiltInRole.Owner)
    .onViolation(Effect.Warn)
    .message('Avoid assigning the Owner role (prefer scoped roles)'),

  // Azure CIS L1 breadth: network default-deny, CMK, diagnostic logging.
  rule()
    .resource(AzureResource.StorageAccount)
    .mustEqual(
      AzureAttribute.NetworkRulesDefaultAction,
      NetworkDefaultAction.Deny,
    )
    .onViolation(Effect.Warn)
    .message('Storage accounts should default-deny network access'),

  rule()
    .resource(AzureResource.KeyVault)
    .mustEqual(
      AzureAttribute.NetworkAclsDefaultAction,
      NetworkDefaultAction.Deny,
    )
    .onViolation(Effect.Warn)
    .message('Key Vaults should default-deny network access'),

  rule()
    .resource(AzureResource.ManagedDisk)
    .mustBeSet(AzureAttribute.DiskEncryptionSetId)
    .onViolation(Effect.Warn)
    .message('Managed disks should use a customer-managed key (CMK)'),

  rule()
    .resource(AzureResource.KeyVault)
    .mustHaveAssociated(
      AzureResource.MonitorDiagnosticSetting,
      AzureAttribute.TargetResourceId,
    )
    .onViolation(Effect.Warn)
    .message('Key Vaults should have diagnostic logging configured'),

  // API Management — reject legacy TLS/SSL protocols + public access.
  rule()
    .resource(AzureResource.ApiManagement)
    .denyWhenTrue(
      AzureAttribute.EnableFrontendTls10,
      AzureAttribute.EnableFrontendTls11,
      AzureAttribute.EnableBackendSsl30,
    )
    .message('API Management must not enable legacy TLS 1.0/1.1 or SSL 3.0')
    .rationale('These protocols are broken; keep the secure defaults off'),

  rule()
    .resource(AzureResource.ApiManagement)
    .denyWhenTrue(AzureAttribute.PublicNetworkAccessEnabled)
    .onViolation(Effect.Warn)
    .message('API Management should disable public network access'),

  // ═══ GCP (google) — concept-not-parity: public exposure lives in IAM ══
  rule()
    .resource(GcpResource.ComputeFirewall)
    .denyIngress(Port.SSH, Port.RDP)
    .message('GCP firewalls must not allow SSH/RDP from 0.0.0.0/0')
    .rationale('CIS GCP — restrict inbound management ports'),

  rule()
    .resource(GcpResource.StorageBucket)
    .mustEqual(
      GcpAttribute.PublicAccessPrevention,
      PublicAccessPreventionMode.Enforced,
    )
    .message('Storage buckets must enforce public access prevention'),

  rule()
    .resource(GcpResource.StorageBucket)
    .mustBeTrue(GcpAttribute.UniformBucketLevelAccess)
    .message('Storage buckets must use uniform bucket-level access'),

  rule()
    .resource(GcpResource.StorageBucketIamMember)
    .denyValue(
      GcpAttribute.Member,
      IamMember.AllUsers,
      IamMember.AllAuthenticatedUsers,
    )
    .message(
      'Buckets must not grant access to allUsers / allAuthenticatedUsers',
    )
    .rationale('The GCP public-exposure anti-pattern (analog of a public ACL)'),

  rule()
    .resource(GcpResource.ProjectIamMember)
    .denyValue(GcpAttribute.Role, PrimitiveRole.Owner)
    .message('Do not grant the primitive roles/owner at project level')
    .rationale('Primitive roles are the GCP analog of an Action:"*" wildcard'),

  rule()
    .resource(GcpResource.ProjectIamMember)
    .denyValue(GcpAttribute.Role, PrimitiveRole.Editor)
    .onViolation(Effect.Warn)
    .message('Avoid the primitive roles/editor at project level'),

  rule()
    .resource(GcpResource.ComputeInstance)
    .listContains(
      GcpAttribute.ServiceAccountScopes,
      OauthScope.CloudPlatform,
      OauthScope.CloudPlatformAlias,
    )
    .onViolation(Effect.Warn)
    .message('Instances should not use the broad cloud-platform scope'),

  rule()
    .resource(GcpResource.SqlDatabaseInstance)
    .denyLiteral(GcpAttribute.RootPassword)
    .message('Cloud SQL root password must be a reference, never hardcoded'),

  rule()
    .resource(GcpResource.SqlDatabaseInstance)
    .mustBeFalse(GcpAttribute.Ipv4Enabled)
    .onViolation(Effect.Warn)
    .message('Cloud SQL instances should disable the public IPv4 address'),

  rule()
    .resource(GcpResource.SqlDatabaseInstance)
    .mustBeOneOf(
      GcpAttribute.SslMode,
      SqlSslMode.EncryptedOnly,
      SqlSslMode.TrustedClientCertRequired,
    )
    .onViolation(Effect.Warn)
    .message('Cloud SQL instances should require SSL (ssl_mode)'),

  // GCP Cloud Run Functions (google_cloudfunctions2_function) — restrict
  // ingress, set a runtime service account, and scan env-var secrets.
  rule()
    .resource(GcpResource.Cloudfunctions2Function)
    .denyValue(GcpAttribute.IngressSettings, IngressSetting.AllowAll)
    .message('Cloud Run Functions must not allow unrestricted ingress (ALLOW_ALL)')
    .rationale('ALLOW_ALL exposes the function to the public internet'),

  rule()
    .resource(GcpResource.Cloudfunctions2Function)
    .mustBeSet(GcpAttribute.ServiceAccountEmail)
    .onViolation(Effect.Warn)
    .message('Cloud Run Functions should set a runtime service account email')
    .rationale('The default compute service account is over-broad; scope a dedicated SA'),

  rule()
    .resource(GcpResource.Cloudfunctions2Function)
    .denyPlaintextEnvSecrets()
    .message('Cloud Run Functions environment variables must not contain plaintext secrets')
    .rationale('Use Secret Manager references, not hardcoded values'),

  // GCP CIS L1: GKE hardening + instance hardening + KMS rotation.
  rule()
    .resource(GcpResource.ContainerCluster)
    .denyWhenTrue(GcpAttribute.EnableLegacyAbac)
    .message('GKE clusters must not enable legacy ABAC authorization')
    .rationale('Legacy ABAC bypasses least-privilege RBAC'),

  rule()
    .resource(GcpResource.ContainerCluster)
    .mustBeTrue(GcpAttribute.EnablePrivateNodes)
    .onViolation(Effect.Warn)
    .message('GKE clusters should use private nodes'),

  rule()
    .resource(GcpResource.ContainerCluster)
    .mustBeTrue(GcpAttribute.NetworkPolicyEnabled)
    .onViolation(Effect.Warn)
    .message('GKE clusters should enable network policy'),

  rule()
    .resource(GcpResource.ComputeInstance)
    .denyWhenTrue(GcpAttribute.CanIpForward)
    .message('Compute instances must not enable IP forwarding'),

  rule()
    .resource(GcpResource.ComputeInstance)
    .mustBeTrue(GcpAttribute.EnableSecureBoot)
    .onViolation(Effect.Warn)
    .message('Compute instances should enable Shielded VM secure boot'),

  rule()
    .resource(GcpResource.ComputeInstance)
    .denyBlockPresence(Block.NetworkInterfaceAccessConfig)
    .onViolation(Effect.Warn)
    .message('Compute instances should not have an external (public) IP')
    .rationale('An access_config block assigns an ephemeral public IP'),

  rule()
    .resource(GcpResource.KmsCryptoKey)
    .mustBeSet(GcpAttribute.RotationPeriod)
    .message('KMS keys must configure automatic rotation')
    .rationale('CIS GCP — a rotation_period must be set'),

  // GCP CIS L1 breadth: flow logs, bucket versioning + access logging.
  rule()
    .resource(GcpResource.ComputeSubnetwork)
    .mustHaveBlock(Block.LogConfig)
    .onViolation(Effect.Warn)
    .message('Subnetworks should enable VPC flow logs (log_config)'),

  rule()
    .resource(GcpResource.StorageBucket)
    .mustBeTrue(GcpAttribute.VersioningEnabled)
    .onViolation(Effect.Warn)
    .message('Storage buckets should enable versioning'),

  rule()
    .resource(GcpResource.StorageBucket)
    .mustHaveBlock(Block.Logging)
    .onViolation(Effect.Warn)
    .message('Storage buckets should enable access logging'),
]
