/**
 * GCP (google) vocabulary. Its own provider module, like Azure's — behind
 * the shared `AnyResource`/`AnyAttribute` unions in ./index. Members drop
 * the provider prefix (`GcpResource.StorageBucket`), matching AWS/Azure.
 *
 * Note the concept-not-parity mapping: GCP's public-exposure and
 * over-permission risks live in IAM *members* (`allUsers`) and *primitive
 * roles* (`roles/owner`), which are the analog of an AWS `Action:"*"`
 * wildcard — expressed here with the generic `denyValue` condition.
 */

export enum GcpResource {
  ComputeFirewall = 'google_compute_firewall',
  StorageBucket = 'google_storage_bucket',
  StorageBucketIamMember = 'google_storage_bucket_iam_member',
  ProjectIamMember = 'google_project_iam_member',
  ComputeInstance = 'google_compute_instance',
  SqlDatabaseInstance = 'google_sql_database_instance',
  ContainerCluster = 'google_container_cluster',
  KmsCryptoKey = 'google_kms_crypto_key',
  ComputeSubnetwork = 'google_compute_subnetwork',
  // Cloud Run Functions (2nd-gen Cloud Functions, `google_cloudfunctions2_function`).
  // `service_config.ingress_settings` gates public exposure; `service_config.
  // service_account_email` is the runtime identity; env-var secrets live in
  // `service_config.environment_variables` (a map, extracted by envVarsOf).
  Cloudfunctions2Function = 'google_cloudfunctions2_function',
}

export enum GcpAttribute {
  // Storage bucket
  PublicAccessPrevention = 'public_access_prevention',
  UniformBucketLevelAccess = 'uniform_bucket_level_access',
  // IAM member (bucket + project)
  Member = 'member',
  Role = 'role',
  // Compute instance (nested → dotted)
  ServiceAccountScopes = 'service_account.scopes',
  // Cloud SQL
  RootPassword = 'root_password',
  Ipv4Enabled = 'settings.ip_configuration.ipv4_enabled',
  SslMode = 'settings.ip_configuration.ssl_mode',
  // Compute instance hardening
  CanIpForward = 'can_ip_forward',
  EnableSecureBoot = 'shielded_instance_config.enable_secure_boot',
  // GKE (google_container_cluster)
  EnableLegacyAbac = 'enable_legacy_abac',
  EnablePrivateNodes = 'private_cluster_config.enable_private_nodes',
  NetworkPolicyEnabled = 'network_policy.enabled',
  // KMS
  RotationPeriod = 'rotation_period',
  // Storage bucket hardening
  VersioningEnabled = 'versioning.enabled',
  // Cloud Run Functions (google_cloudfunctions2_function) — service_config.
  IngressSettings = 'service_config.ingress_settings',
  ServiceAccountEmail = 'service_config.service_account_email',
}

export enum PublicAccessPreventionMode {
  Enforced = 'enforced',
}

// Public IAM principals — the GCP "public exposure" anti-pattern.
export enum IamMember {
  AllUsers = 'allUsers',
  AllAuthenticatedUsers = 'allAuthenticatedUsers',
}

// Primitive roles — the GCP over-permission anti-pattern (analog of `*`).
export enum PrimitiveRole {
  Owner = 'roles/owner',
  Editor = 'roles/editor',
}

// Broad OAuth scopes on an instance service account (both alias + full URL).
export enum OauthScope {
  CloudPlatform = 'https://www.googleapis.com/auth/cloud-platform',
  CloudPlatformAlias = 'cloud-platform',
}

// Cloud SQL SSL modes considered secure (the insecure default is
// ALLOW_UNENCRYPTED_AND_ENCRYPTED). Use with `mustBeOneOf`.
export enum SqlSslMode {
  EncryptedOnly = 'ENCRYPTED_ONLY',
  TrustedClientCertRequired = 'TRUSTED_CLIENT_CERTIFICATE_REQUIRED',
}

// Cloud Run Functions ingress settings (google_cloudfunctions2_function
// service_config.ingress_settings). ALLOW_ALL is the public-exposure
// anti-pattern; the restricted values gate traffic to the LB/VPC.
export enum IngressSetting {
  AllowAll = 'ALLOW_ALL',
  AllowInternalAndGclb = 'ALLOW_INTERNAL_AND_GCLB',
  AllowInternalOnly = 'ALLOW_INTERNAL_ONLY',
}
