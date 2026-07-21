import { AzureResource, AzureAttribute } from './azure'
import { GcpResource, GcpAttribute } from './gcp'

/**
 * Closed vocabulary for every domain value (doc 02). No bare strings.
 *
 * NOTE: doc 02 specifies `const enum`. We use regular `enum` here because
 * `const enum` cannot be inlined across files by the esbuild/Vitest
 * transpiler under `isolatedModules`. Regular `enum` gives the identical
 * typo-safety (a misspelled member is a compile error); only cross-file
 * inlining differs, which is irrelevant here. See doc 02 note.
 */

export enum AwsResource {
  SecurityGroup = 'aws_security_group',
  // The modern decomposed form of security-group ingress.
  VpcSecurityGroupIngressRule = 'aws_vpc_security_group_ingress_rule',
  DbInstance = 'aws_db_instance',
  S3Bucket = 'aws_s3_bucket',
  // The modern decomposed form of an S3 bucket ACL (inline `acl` was
  // deprecated in AWS provider v4).
  S3BucketAcl = 'aws_s3_bucket_acl',
  S3BucketPublicAccessBlock = 'aws_s3_bucket_public_access_block',
  S3BucketPolicy = 'aws_s3_bucket_policy',
  EbsVolume = 'aws_ebs_volume',
  EfsFileSystem = 'aws_efs_file_system',
  KmsKey = 'aws_kms_key',
  Instance = 'aws_instance',
  DynamodbTable = 'aws_dynamodb_table',
  EcrRepository = 'aws_ecr_repository',
  IamPolicy = 'aws_iam_policy',
  IamRolePolicy = 'aws_iam_role_policy',
  EcsService = 'aws_ecs_service',
  EksCluster = 'aws_eks_cluster',
  Lb = 'aws_lb',
  LbListener = 'aws_lb_listener',
  EcsTaskDefinition = 'aws_ecs_task_definition',
  SecretsmanagerSecretVersion = 'aws_secretsmanager_secret_version',
  RdsCluster = 'aws_rds_cluster',
  RdsClusterInstance = 'aws_rds_cluster_instance',
  RedshiftCluster = 'aws_redshift_cluster',
  ElasticacheReplicationGroup = 'aws_elasticache_replication_group',
  S3BucketServerSideEncryptionConfiguration = 'aws_s3_bucket_server_side_encryption_configuration',
  S3BucketVersioning = 'aws_s3_bucket_versioning',
  SecretsmanagerSecret = 'aws_secretsmanager_secret',
  SecretsmanagerSecretRotation = 'aws_secretsmanager_secret_rotation',
  Vpc = 'aws_vpc',
  FlowLog = 'aws_flow_log',
  Subnet = 'aws_subnet',
  Cloudtrail = 'aws_cloudtrail',
  IamAccountPasswordPolicy = 'aws_iam_account_password_policy',
  ApiGatewayMethod = 'aws_api_gateway_method',
  ApiGatewayStage = 'aws_api_gateway_stage',
  Apigatewayv2Stage = 'aws_apigatewayv2_stage',
  // AWS Config (CIS §3.1-3.6) — recorder settings.
  ConfigConfigurationRecorder = 'aws_config_configuration_recorder',
  // IAM Access Analyzer (CIS §4.15) — vocabulary entry; the useful check
  // is "does an analyzer exist?" (a project-level presence check the engine
  // doesn't yet support). Added so the resource is at least recognized.
  AccessAnalyzer = 'aws_accessanalyzer_analyzer',
}

// Nested block names/paths, for `mustHaveBlock` / `denyBlockPresence`.
export enum Block {
  EncryptionConfig = 'encryption_config',
  // A GCP instance access_config (nested in network_interface) = public IP.
  NetworkInterfaceAccessConfig = 'network_interface.access_config',
  // GCP subnetwork VPC flow logs / storage bucket access logging.
  LogConfig = 'log_config',
  Logging = 'logging',
  // AWS API Gateway stage access logging.
  AccessLogSettings = 'access_log_settings',
}

// Wildcard sentinel for list/value checks (e.g. an IAM/RBAC action of "*").
export enum Wildcard {
  All = '*',
}

// AWS API Gateway method authorization types. `NONE` = unauthenticated.
export enum ApiGatewayAuthorization {
  None = 'NONE',
}

// Multi-provider surface: the cloud-neutral engine (rules, conditions,
// normalized model) accepts any provider's resource/attribute vocabulary
// via these unions. Add a provider = add its module to the union here.
export {
  AzureResource,
  AzureAttribute,
  StorageTlsVersion,
  SqlTlsVersion,
  BuiltInRole,
  NetworkDefaultAction,
} from './azure'
export {
  GcpResource,
  GcpAttribute,
  PublicAccessPreventionMode,
  IamMember,
  PrimitiveRole,
  OauthScope,
  SqlSslMode,
} from './gcp'
export type AnyResource = AwsResource | AzureResource | GcpResource
export type AnyAttribute = AwsAttribute | AzureAttribute | GcpAttribute

export enum Port {
  SSH = 22,
  RDP = 3389,
  Postgres = 5432,
  MySQL = 3306,
}

export enum Cidr {
  Internet = '0.0.0.0/0',
  InternetV6 = '::/0',
}

export enum Effect {
  Block = 'block',
  Warn = 'warn',
  RequireApproval = 'require_approval',
}

export enum Tag {
  Team = 'team',
  CostCenter = 'cost_center',
  Environment = 'environment',
  DataClassification = 'data_classification',
}

export enum AwsAttribute {
  StorageEncrypted = 'storage_encrypted',
  PubliclyAccessible = 'publicly_accessible',
  MultiAz = 'multi_az',
  DeletionProtection = 'deletion_protection',
  IamDatabaseAuthenticationEnabled = 'iam_database_authentication_enabled',
  // Encryption at rest (aws_ebs_volume, aws_efs_file_system)
  Encrypted = 'encrypted',
  // aws_kms_key
  EnableKeyRotation = 'enable_key_rotation',
  // aws_s3_bucket_public_access_block
  BlockPublicAcls = 'block_public_acls',
  BlockPublicPolicy = 'block_public_policy',
  IgnorePublicAcls = 'ignore_public_acls',
  RestrictPublicBuckets = 'restrict_public_buckets',
  BackupRetentionPeriod = 'backup_retention_period',
  // Nested-block attributes are addressed with a dotted path (the engine
  // flattens `block { attr = ... }` to `block.attr`).
  HttpTokens = 'metadata_options.http_tokens',
  ServerSideEncryptionEnabled = 'server_side_encryption.enabled',
  PointInTimeRecoveryEnabled = 'point_in_time_recovery.enabled',
  ImageScanOnPush = 'image_scanning_configuration.scan_on_push',
  // EC2 instance
  RootBlockDeviceEncrypted = 'root_block_device.encrypted',
  AssociatePublicIpAddress = 'associate_public_ip_address',
  // ECS / EKS / ELB
  AssignPublicIp = 'network_configuration.assign_public_ip',
  EndpointPublicAccess = 'vpc_config.endpoint_public_access',
  AccessLogsEnabled = 'access_logs.enabled',
  DropInvalidHeaderFields = 'drop_invalid_header_fields',
  // List-valued (EKS)
  PublicAccessCidrs = 'vpc_config.public_access_cidrs',
  EnabledClusterLogTypes = 'enabled_cluster_log_types',
  // ALB / NLB listener
  SslPolicy = 'ssl_policy',
  Protocol = 'protocol',
  // Secret-bearing attributes (must be a reference, never a literal)
  SecretString = 'secret_string',
  Password = 'password',
  MasterPassword = 'master_password',
  AuthToken = 'auth_token',
  // Cross-resource association keys (child -> parent, for mustHaveAssociated)
  Bucket = 'bucket',
  SecretId = 'secret_id',
  VpcId = 'vpc_id',
  // VPC subnet exposure
  MapPublicIpOnLaunch = 'map_public_ip_on_launch',
  AssignIpv6AddressOnCreation = 'assign_ipv6_address_on_creation',
  // CloudTrail (audit logging)
  IsMultiRegionTrail = 'is_multi_region_trail',
  EnableLogFileValidation = 'enable_log_file_validation',
  KmsKeyId = 'kms_key_id',
  // IAM account password policy
  MinimumPasswordLength = 'minimum_password_length',
  RequireSymbols = 'require_symbols',
  RequireNumbers = 'require_numbers',
  RequireUppercaseCharacters = 'require_uppercase_characters',
  RequireLowercaseCharacters = 'require_lowercase_characters',
  PasswordReusePrevention = 'password_reuse_prevention',
  MaxPasswordAge = 'max_password_age',
  // API Gateway
  Authorization = 'authorization',
  XrayTracingEnabled = 'xray_tracing_enabled',
  // AWS Config (CIS §3.1-3.2) — recording group settings (flattened from
  // the `recording_group {}` nested block).
  RecordingGroupAllSupported = 'recording_group.all_supported',
  RecordingGroupIncludeGlobalResourceTypes = 'recording_group.include_global_resource_types',
}

// Known weak ELB TLS policies (permit TLS 1.0/1.1). Use with `denyValue`.
export enum TlsPolicy {
  Legacy2015 = 'ELBSecurityPolicy-2015-05',
  Tls10 = 'ELBSecurityPolicy-TLS-1-0-2015-04',
  Tls11 = 'ELBSecurityPolicy-TLS-1-1-2017-01',
}

// Listener protocols (for `denyValue` on plaintext).
export enum Protocol {
  Http = 'HTTP',
  Https = 'HTTPS',
  Tcp = 'TCP',
  Tls = 'TLS',
}

// EKS control-plane log types (for `listMustInclude`).
export enum EksLogType {
  Api = 'api',
  Audit = 'audit',
  Authenticator = 'authenticator',
  ControllerManager = 'controllerManager',
  Scheduler = 'scheduler',
}

// Closed value set for EC2 instance metadata tokens (IMDSv1 vs IMDSv2).
export enum HttpTokens {
  Optional = 'optional',
  Required = 'required',
}

export enum Acl {
  Private = 'private',
  PublicRead = 'public-read',
  PublicReadWrite = 'public-read-write',
}

export enum Environment {
  Development = 'development',
  Staging = 'staging',
  Production = 'production',
}

// Org-defined approval groups/roles. Enum-backed like every other domain
// value so a typo'd approver is a compile error, not a misrouted approval.
export enum Approver {
  PlatformTeam = 'platform-team',
  SecurityArchitect = 'security-architect',
  FinOps = 'finops',
  SRE = 'sre',
}
