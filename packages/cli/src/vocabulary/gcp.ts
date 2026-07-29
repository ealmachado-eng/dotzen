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

  // ── ROADMAP item 2: GCP supporting-resource vocabulary ───────────────
  // Recognized-but-not-yet-rule-bearing. Removes `ungoverned` noise on
  // real google module repos. Add-only; no engine work unless a resource
  // has structure normalize doesn't already flatten generically.
  // Compute / GCE
  ComputeDisk = 'google_compute_disk',
  ComputeImage = 'google_compute_image',
  ComputeSnapshot = 'google_compute_snapshot',
  ComputeMachineImage = 'google_compute_machine_image',
  ComputeInstanceTemplate = 'google_compute_instance_template',
  ComputeInstanceGroup = 'google_compute_instance_group',
  ComputeInstanceGroupManager = 'google_compute_instance_group_manager',
  ComputeRegionInstanceGroupManager = 'google_compute_region_instance_group_manager',
  ComputeAutoscalar = 'google_compute_autoscaler',
  ComputeRegionAutoscalar = 'google_compute_region_autoscaler',
  ComputeTargetPool = 'google_compute_target_pool',
  ComputeTargetHttpProxy = 'google_compute_target_http_proxy',
  ComputeTargetHttpsProxy = 'google_compute_target_https_proxy',
  ComputeUrlMap = 'google_compute_url_map',
  ComputeBackendBucket = 'google_compute_backend_bucket',
  ComputeBackendService = 'google_compute_backend_service',
  ComputeRegionBackendService = 'google_compute_region_backend_service',
  ComputeForwardingRule = 'google_compute_forwarding_rule',
  ComputeGlobalForwardingRule = 'google_compute_global_forwarding_rule',
  ComputeHealthCheck = 'google_compute_health_check',
  ComputeHttpsHealthCheck = 'google_compute_https_health_check',
  ComputeHttpHealthCheck = 'google_compute_http_health_check',
  ComputeRegionHealthCheck = 'google_compute_region_health_check',
  ComputeSslCertificate = 'google_compute_ssl_certificate',
  ComputeManagedSslCertificate = 'google_compute_managed_ssl_certificate',
  ComputeRegionSslCertificate = 'google_compute_region_ssl_certificate',
  ComputeSecurityPolicy = 'google_compute_security_policy',
  ComputeRouter = 'google_compute_router',
  ComputeRouterNat = 'google_compute_router_nat',
  ComputeVpnGateway = 'google_compute_vpn_gateway',
  ComputeVpnTunnel = 'google_compute_vpn_tunnel',
  ComputeInterconnect = 'google_compute_interconnect',
  ComputeInterconnectAttachment = 'google_compute_interconnect_attachment',
  ComputeNetworkEndpointGroup = 'google_compute_network_endpoint_group',
  ComputeRegionNetworkEndpointGroup = 'google_compute_region_network_endpoint_group',
  ComputeNetworkPeeringRoutesConfig = 'google_compute_network_peering_routes_config',
  ComputeRoute = 'google_compute_route',
  ComputeFirewallPolicy = 'google_compute_firewall_policy',
  ComputeNetworkFirewallPolicy = 'google_compute_network_firewall_policy',
  // Networking — VPC / shared VPC / DNS
  ComputeNetwork = 'google_compute_network',
  ComputeSharedVpcHostProject = 'google_compute_shared_vpc_host_project',
  ComputeSharedVpcServiceProject = 'google_compute_shared_vpc_service_project',
  ComputeAddress = 'google_compute_address',
  ComputeGlobalAddress = 'google_compute_global_address',
  DnsManagedZone = 'google_dns_managed_zone',
  DnsPolicy = 'google_dns_policy',
  DnsRecordSet = 'google_dns_record_set',
  DnsResponsePolicy = 'google_dns_response_policy',
  DnsResponsePolicyRule = 'google_dns_response_policy_rule',
  // Storage
  StorageBucketObject = 'google_storage_bucket_object',
  StorageBucketAcl = 'google_storage_bucket_acl',
  StorageObjectAcl = 'google_storage_object_acl',
  StorageBucketAccessControl = 'google_storage_bucket_access_control',
  StorageDefaultObjectAcl = 'google_storage_default_object_acl',
  StorageBucketIamBinding = 'google_storage_bucket_iam_binding',
  StorageBucketIamPolicy = 'google_storage_bucket_iam_policy',
  StorageTransferJob = 'google_storage_transfer_job',
  StorageHmacKey = 'google_storage_hmac_key',
  Filestore = 'google_filestore_instance',
  FilestoreBackup = 'google_filestore_backup',
  FilestoreSnapshot = 'google_filestore_snapshot',
  // IAM / Identity
  ProjectIamBinding = 'google_project_iam_binding',
  ProjectIamPolicy = 'google_project_iam_policy',
  ProjectIamCustomRole = 'google_project_iam_custom_role',
  ProjectIamAuditConfig = 'google_project_iam_audit_config',
  ProjectOrganization = 'google_organization_iam_member',
  OrganizationIamBinding = 'google_organization_iam_binding',
  OrganizationIamPolicy = 'google_organization_iam_policy',
  FolderIamMember = 'google_folder_iam_member',
  FolderIamBinding = 'google_folder_iam_binding',
  FolderIamPolicy = 'google_folder_iam_policy',
  ServiceAccount = 'google_service_account',
  ServiceAccountIamBinding = 'google_service_account_iam_binding',
  ServiceAccountIamMember = 'google_service_account_iam_member',
  ServiceAccountIamPolicy = 'google_service_account_iam_policy',
  ServiceAccountKey = 'google_service_account_key',
  IamWorkloadIdentityPool = 'google_iam_workload_identity_pool',
  IamWorkloadIdentityPoolProvider = 'google_iam_workload_identity_pool_provider',
  IamWorkforcePool = 'google_iam_workforce_pool',
  IamWorkforcePoolProvider = 'google_iam_workforce_pool_provider',
  IamAccessBoundaryPolicy = 'google_iam_access_boundary_policy',
  // SQL extras
  SqlDatabase = 'google_sql_database',
  SqlUser = 'google_sql_user',
  SqlSslCert = 'google_sql_ssl_cert',
  // GKE extras
  ContainerNodePool = 'google_container_node_pool',
  GkeHubFeature = 'google_gke_hub_feature',
  GkeHubFeatureMembership = 'google_gke_hub_feature_membership',
  GkeHubMembership = 'google_gke_hub_membership',
  // KMS extras
  KmsCryptoKeyVersion = 'google_kms_crypto_key_version',
  KmsKeyRing = 'google_kms_key_ring',
  KmsKeyRingImportJob = 'google_kms_key_ring_import_job',
  KmsSecretCiphertext = 'google_kms_secret_ciphertext',
  // Cloud Run / Cloud Functions v1
  CloudfunctionsFunction = 'google_cloudfunctions_function',
  CloudRunService = 'google_cloud_run_service',
  CloudRunServiceIamBinding = 'google_cloud_run_service_iam_binding',
  CloudRunServiceIamMember = 'google_cloud_run_service_iam_member',
  CloudRunServiceIamPolicy = 'google_cloud_run_service_iam_policy',
  // Pub/Sub / Eventarc / Tasks
  PubsubTopic = 'google_pubsub_topic',
  PubsubSubscription = 'google_pubsub_subscription',
  PubsubSchema = 'google_pubsub_schema',
  PubsubTopic_IamBinding = 'google_pubsub_topic_iam_binding',
  PubsubTopicIamMember = 'google_pubsub_topic_iam_member',
  PubsubSubscriptionIamBinding = 'google_pubsub_subscription_iam_binding',
  PubsubSubscriptionIamMember = 'google_pubsub_subscription_iam_member',
  EventarcTrigger = 'google_eventarc_trigger',
  CloudTasksQueue = 'google_cloud_tasks_queue',
  // BigQuery / Dataflow / Dataproc / Composer / Data Fusion
  BigqueryDataset = 'google_bigquery_dataset',
  BigqueryTable = 'google_bigquery_table',
  BigqueryJob = 'google_bigquery_job',
  BigqueryConnection = 'google_bigquery_connection',
  BigqueryReservation = 'google_bigquery_reservation',
  BigqueryDataTransferConfig = 'google_bigquery_data_transfer_config',
  BigqueryRoutine = 'google_bigquery_routine',
  BigqueryTableIamMember = 'google_bigquery_table_iam_member',
  BigqueryDatasetIamMember = 'google_bigquery_dataset_iam_member',
  BigqueryDatasetAccess = 'google_bigquery_dataset_access',
  DataflowJob = 'google_dataflow_job',
  DataprocCluster = 'google_dataproc_cluster',
  DataprocJob = 'google_dataproc_job',
  DataprocAutoscalingPolicy = 'google_dataproc_autoscaling_policy',
  DataprocMetastoreService = 'google_dataproc_metastore_service',
  ComposerEnvironment = 'google_composer_environment',
  DataFusionInstance = 'google_data_fusion_instance',
  // Spanner / Firestore / Memorystore / Datastore
  SpannerInstance = 'google_spanner_instance',
  SpannerDatabase = 'google_spanner_database',
  FirestoreDatabase = 'google_firestore_database',
  FirestoreIndex = 'google_firestore_index',
  MemorystoreInstance = 'google_redis_instance',
  // Cloud Build / Source / Git / Cloud Deploy
  CloudbuildTrigger = 'google_cloudbuild_trigger',
  CloudbuildWorkerPool = 'google_cloudbuild_worker_pool',
  SourcerepoRepository = 'google_sourcerepo_repository',
  ClouddeployDeliveryPipeline = 'google_clouddeploy_delivery_pipeline',
  ClouddeployTarget = 'google_clouddeploy_target',
  // Secret Manager
  SecretManagerSecret = 'google_secret_manager_secret',
  SecretManagerSecretVersion = 'google_secret_manager_secret_version',
  SecretManagerSecretIamMember = 'google_secret_manager_secret_iam_member',
  SecretManagerSecretIamBinding = 'google_secret_manager_secret_iam_binding',
  // Cloud Armor / SSL / Network Security
  ComputeSecurityPolicyRule = 'google_compute_security_policy_rule',
  ComputeRegionSecurityPolicy = 'google_compute_region_security_policy',
  ComputeRegionSecurityPolicyRule = 'google_compute_region_security_policy_rule',
  NetworkSecurityAuthorizationPolicy = 'google_network_security_authorization_policy',
  NetworkSecurityServerTlsPolicy = 'google_network_security_server_tls_policy',
  NetworkSecurityClientTlsPolicy = 'google_network_security_client_tls_policy',
  NetworkSecurityGatewaySecurityPolicy = 'google_network_security_gateway_security_policy',
  // Cloud Armor expandable
  NetworkEdgeSecurityService = 'google_compute_network_edge_security_service',
  ComputePacketMirroring = 'google_compute_packet_mirroring',
  // VPC Service Controls / Cloud Endpoints / API Gateway
  AccessContextManagerAccessPolicy = 'google_access_context_manager_access_policy',
  AccessContextManagerServicePerimeter = 'google_access_context_manager_service_perimeter',
  AccessContextManagerAccessLevel = 'google_access_context_manager_access_level',
  ApigeeEnvironment = 'google_apigee_environment',
  ApigeeOrganization = 'google_apigee_organization',
  ApigeeInstance = 'google_apigee_instance',
  ApigeeAddonsConfig = 'google_apigee_addons_config',
  // Logging / Monitoring
  LoggingProjectSink = 'google_logging_project_sink',
  LoggingOrganizationSink = 'google_logging_organization_sink',
  LoggingFolderSink = 'google_logging_folder_sink',
  LoggingBillingAccountSink = 'google_logging_billing_account_sink',
  LoggingMetric = 'google_logging_metric',
  LoggingProjectExclusion = 'google_logging_project_exclusion',
  LoggingFolderExclusion = 'google_logging_folder_exclusion',
  LoggingOrganizationExclusion = 'google_logging_organization_exclusion',
  MonitoringAlertPolicy = 'google_monitoring_alert_policy',
  MonitoringGroup = 'google_monitoring_group',
  MonitoringNotificationChannel = 'google_monitoring_notification_channel',
  MonitoringUptimeCheckConfig = 'google_monitoring_uptime_check_config',
  MonitoringDashboard = 'google_monitoring_dashboard',
  MonitoringService = 'google_monitoring_service',
  MonitoringSlo = 'google_monitoring_slo',
  MonitoringCustomService = 'google_monitoring_custom_service',
  MonitoringMetricDescriptor = 'google_monitoring_metric_descriptor',
  // Cloud Trace / Profiler / Cloud Error Reporting
  // Cloud Identity / Identity Platform
  IdentityPlatformConfig = 'google_identity_platform_config',
  IdentityPlatformTenant = 'google_identity_platform_tenant',
  IdentityPlatformOauthIdpConfig = 'google_identity_platform_oauth_idp_config',
  IdentityPlatformInboundSamlConfig = 'google_identity_platform_inbound_saml_config',
  // Cloud Billing / Budget
  BillingBudget = 'google_billing_budget',
  // Cloud Asset Inventory / Recommender
  // API Keys / GMP / Looker
  ApikeysKey = 'google_apikeys_key',
  LookerInstance = 'google_looker_instance',
  // Game Services / Kepler / Network Connectivity
  NetworkConnectivitySpoke = 'google_network_connectivity_spoke',
  NetworkConnectivityHub = 'google_network_connectivity_hub',
  // Vertex AI / ML
  VertexDataset = 'google_vertex_ai_dataset',
  VertexEndpoint = 'google_vertex_ai_endpoint',
  VertexIndex = 'google_vertex_ai_index',
  VertexTensorboard = 'google_vertex_ai_tensorboard',
  VertexFeaturestore = 'google_vertex_ai_featurestore',
  // Binary Authorization / Artifact Registry
  BinaryAuthorizationPolicy = 'google_binary_authorization_policy',
  BinaryAuthorizationAttestor = 'google_binary_authorization_attestor',
  ArtifactRegistryRepository = 'google_artifact_registry_repository',
  ArtifactRegistryRepositoryIamMember = 'google_artifact_registry_repository_iam_member',
  ArtifactRegistryRepositoryIamPolicy = 'google_artifact_registry_repository_iam_policy',
  // Chronicle / Background VM / Compute Reservation
  ComputeReservation = 'google_compute_reservation',
  // Cloud DNS IAM Bindings for completeness
  OrgPolicy = 'google_org_policy_policy',
  // Jigu / Anos
  AlibabaInstallAmazonProvider = 'google_access_context_manager_access_policy_iam_binding',
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
  ShieldedNodesEnabled = 'shielded_nodes.enabled',
  // KMS
  RotationPeriod = 'rotation_period',
  // Storage bucket hardening
  VersioningEnabled = 'versioning.enabled',
  // Cloud Run Functions (google_cloudfunctions2_function) — service_config.
  IngressSettings = 'service_config.ingress_settings',
  ServiceAccountEmail = 'service_config.service_account_email',
  // BigQuery — public-access principal (standalone resource + inline block).
  SpecialGroup = 'special_group',
  AccessSpecialGroup = 'access.special_group',
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
