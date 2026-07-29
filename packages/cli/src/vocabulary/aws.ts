/**
 * AWS vocabulary. Kept in its own provider module — not merged with Azure /
 * GCP — so each cloud's `spec.ts` reads in its own idiom and the enums stay
 * small ("Prose as Code", doc 02). The shared `AnyResource`/`AnyAttribute`
 * unions (in ./index) let the cloud-neutral engine accept every provider's
 * vocabulary.
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
  // The modern decomposed form of security-group egress.
  VpcSecurityGroupEgressRule = 'aws_vpc_security_group_egress_rule',
  // The legacy standalone SG rule (handles BOTH ingress and egress via
  // `type = "ingress" | "egress"`). Older but still extremely common.
  SecurityGroupRule = 'aws_security_group_rule',
  DbInstance = 'aws_db_instance',
  S3Bucket = 'aws_s3_bucket',
  S3DirectoryBucket = 'aws_s3_directory_bucket',
  // S3 companion configuration resources (no security rules yet, but
  // recognized so they don't surface as ungoverned noise on the S3 module).
  S3BucketAccelerateConfiguration = 'aws_s3_bucket_accelerate_configuration',
  S3BucketAnalyticsConfiguration = 'aws_s3_bucket_analytics_configuration',
  S3BucketMetadataConfiguration = 'aws_s3_bucket_metadata_configuration',
  S3BucketObjectLockConfiguration = 'aws_s3_bucket_object_lock_configuration',
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
  // ECR lifecycle policy — governs image retention/cleanup. Associated to a
  // repository via the `repository` attribute.
  EcrLifecyclePolicy = 'aws_ecr_lifecycle_policy',
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
  // AWS Lambda (serverless). `tracing_config.mode` carries X-Ray tracing;
  // `kms_key_arn` encrypts environment variables at rest.
  LambdaFunction = 'aws_lambda_function',
  // ── Supporting resources (from real-world RDS/VPC deployments) ───────
  IamRole = 'aws_iam_role',
  IamRolePolicyAttachment = 'aws_iam_role_policy_attachment',
  CloudwatchMetricAlarm = 'aws_cloudwatch_metric_alarm',
  DbSubnetGroup = 'aws_db_subnet_group',
  DbParameterGroup = 'aws_db_parameter_group',
  SsmParameter = 'aws_ssm_parameter',

  // ── ROADMAP item 1: bulk AWS supporting-resource vocabulary ───────────
  // Recognized-but-not-yet-rule-bearing types. Surfacing them here removes
  // `ungoverned` noise on real module repos (50% coverage gap per the
  // realistic-rds dogfood). Adding a rule later is enum-add only — no
  // engine work unless the resource has a structure normalize doesn't
  // already flatten generically. Grouped by service.
  // VPC / network
  InternetGateway = 'aws_internet_gateway',
  NatGateway = 'aws_nat_gateway',
  RouteTable = 'aws_route_table',
  Route = 'aws_route',
  RouteTableAssociation = 'aws_route_table_association',
  NetworkAcl = 'aws_network_acl',
  NetworkAclRule = 'aws_network_acl_rule',
  VpcEndpoint = 'aws_vpc_endpoint',
  VpcPeeringConnection = 'aws_vpc_peering_connection',
  VpcIpv4CidrBlockAssociation = 'aws_vpc_ipv4_cidr_block_association',
  EgressOnlyInternetGateway = 'aws_egress_only_internet_gateway',
  DefaultNetworkAcl = 'aws_default_network_acl',
  DefaultRouteTable = 'aws_default_route_table',
  DefaultSecurityGroup = 'aws_default_security_group',
  DefaultSubnet = 'aws_default_subnet',
  DefaultVpc = 'aws_default_vpc',
  VpcEndpointService = 'aws_vpc_endpoint_service',
  VpcEndpointConnectionNotification = 'aws_vpc_endpoint_connection_notification',
  VpcEndpointRouteTableAssociation = 'aws_vpc_endpoint_route_table_association',
  VpcEndpointSecurityGroupAssociation = 'aws_vpc_endpoint_security_group_association',
  VpcEndpointSubnetAssociation = 'aws_vpc_endpoint_subnet_association',
  CustomerGateway = 'aws_customer_gateway',
  VpnConnection = 'aws_vpn_connection',
  VpnGateway = 'aws_vpn_gateway',
  // VPC extras — recognized so they don't surface as ungoverned on real VPC modules.
  VpnGatewayAttachment = 'aws_vpn_gateway_attachment',
  VpnGatewayRoutePropagation = 'aws_vpn_gateway_route_propagation',
  VpcDhcpOptions = 'aws_vpc_dhcp_options',
  VpcDhcpOptionsAssociation = 'aws_vpc_dhcp_options_association',
  VpcBlockPublicAccessExclusion = 'aws_vpc_block_public_access_exclusion',
  VpcBlockPublicAccessOptions = 'aws_vpc_block_public_access_options',
  VpnConnectionRoute = 'aws_vpn_connection_route',
  TransitGateway = 'aws_ec2_transit_gateway',
  TransitGatewayRoute = 'aws_ec2_transit_gateway_route',
  TransitGatewayRouteTable = 'aws_ec2_transit_gateway_route_table',
  TransitGatewayRouteTableAssociation = 'aws_ec2_transit_gateway_route_table_association',
  TransitGatewayRouteTablePropagation = 'aws_ec2_transit_gateway_route_table_propagation',
  TransitGatewayPeeringAttachment = 'aws_ec2_transit_gateway_peering_attachment',
  TransitGatewayVpcAttachment = 'aws_ec2_transit_gateway_vpc_attachment',
  // IAM
  IamUser = 'aws_iam_user',
  IamGroup = 'aws_iam_group',
  IamGroupMembership = 'aws_iam_group_membership',
  IamGroupPolicy = 'aws_iam_group_policy',
  IamGroupPolicyAttachment = 'aws_iam_group_policy_attachment',
  IamUserGroupMembership = 'aws_iam_user_group_membership',
  IamUserPolicy = 'aws_iam_user_policy',
  IamUserPolicyAttachment = 'aws_iam_user_policy_attachment',
  // Generic policy attachment — can attach to roles, users, or groups via
  // `roles`/`users`/`groups` list attrs. The three specific variants above
  // (role/group/user) are preferred when the target type is known, but the
  // generic form is common in modules that parameterize the principal type.
  IamPolicyAttachment = 'aws_iam_policy_attachment',
  IamUserSshKey = 'aws_iam_user_ssh_key',
  IamAccessKey = 'aws_iam_access_key',
  IamInstanceProfile = 'aws_iam_instance_profile',
  IamOpenidConnectProvider = 'aws_iam_openid_connect_provider',
  IamSamlProvider = 'aws_iam_saml_provider',
  IamServiceLinkedRole = 'aws_iam_service_linked_role',
  // S3 / storage
  S3BucketObject = 'aws_s3_bucket_object',
  S3Object = 'aws_s3_object',
  S3BucketLifecycleConfiguration = 'aws_s3_bucket_lifecycle_configuration',
  S3BucketReplicationConfiguration = 'aws_s3_bucket_replication_configuration',
  S3BucketNotification = 'aws_s3_bucket_notification',
  S3BucketIntelligentTieringConfiguration = 'aws_s3_bucket_intelligent_tiering_configuration',
  S3BucketInventory = 'aws_s3_bucket_inventory',
  S3BucketMetric = 'aws_s3_bucket_metric',
  S3BucketOwnershipControls = 'aws_s3_bucket_ownership_controls',
  S3BucketRequestPaymentConfiguration = 'aws_s3_bucket_request_payment_configuration',
  S3BucketCorsConfiguration = 'aws_s3_bucket_cors_configuration',
  S3BucketWebsiteConfiguration = 'aws_s3_bucket_website_configuration',
  S3BucketLogging = 'aws_s3_bucket_logging',
  S3AccessPoint = 'aws_s3_access_point',
  S3ControlAccessPointPolicy = 'aws_s3control_access_point_policy',
  S3OutpostsEndpoint = 'aws_s3outposts_endpoint',
  // Compute
  LaunchTemplate = 'aws_launch_template',
  AutoscalingGroup = 'aws_autoscaling_group',
  AutoscalingAttachment = 'aws_autoscaling_attachment',
  AutoscalingGroupTag = 'aws_autoscaling_group_tag',
  AutoscalingLifecycleHook = 'aws_autoscaling_lifecycle_hook',
  AutoscalingNotification = 'aws_autoscaling_notification',
  AutoscalingPolicy = 'aws_autoscaling_policy',
  AutoscalingSchedule = 'aws_autoscaling_schedule',
  KeyPair = 'aws_key_pair',
  PlacementGroup = 'aws_placement_group',
  SpotInstanceRequest = 'aws_spot_instance_request',
  SpotDatafeedSubscription = 'aws_spot_datafeed_subscription',
  SpotFleetRequest = 'aws_spot_fleet_request',
  // Modern EC2 decomposition — `aws_ec2_tag` (per-tag resource, the successor
  // to inline `tags`), `aws_volume_attachment` (EBS↔instance link),
  // `aws_network_interface` (ENI), `aws_ec2_capacity_reservation`. Recognized
  // so they don't surface as ungoverned on real EC2 module repos.
  Ec2Tag = 'aws_ec2_tag',
  VolumeAttachment = 'aws_volume_attachment',
  NetworkInterface = 'aws_network_interface',
  Ec2CapacityReservation = 'aws_ec2_capacity_reservation',
  ImagebuilderComponent = 'aws_imagebuilder_component',
  ImagebuilderImage = 'aws_imagebuilder_image',
  ImagebuilderImagePipeline = 'aws_imagebuilder_image_pipeline',
  ImagebuilderImageRecipe = 'aws_imagebuilder_image_recipe',
  ImagebuilderInfrastructureConfiguration = 'aws_imagebuilder_infrastructure_configuration',
  ImagebuilderDistributionConfiguration = 'aws_imagebuilder_distribution_configuration',
  // Monitoring / logs
  CloudwatchLogGroup = 'aws_cloudwatch_log_group',
  CloudwatchLogStream = 'aws_cloudwatch_log_stream',
  CloudwatchLogDestination = 'aws_cloudwatch_log_destination',
  CloudwatchLogDestinationPolicy = 'aws_cloudwatch_log_destination_policy',
  CloudwatchLogResourcePolicy = 'aws_cloudwatch_log_resource_policy',
  CloudwatchLogMetricFilter = 'aws_cloudwatch_log_metric_filter',
  CloudwatchDashboard = 'aws_cloudwatch_dashboard',
  CloudwatchCompositeAlarm = 'aws_cloudwatch_composite_alarm',
  CloudwatchEventBus = 'aws_cloudwatch_event_bus',
  CloudwatchEventBusPolicy = 'aws_cloudwatch_event_bus_policy',
  CloudwatchEventArchive = 'aws_cloudwatch_event_archive',
  CloudwatchEventPermission = 'aws_cloudwatch_event_permission',
  // EventBridge (formerly CloudWatch Events) — rule/target/connection/api-
  // destination are the legacy `aws_cloudwatch_event_*` names still used by
  // the vast majority of modules. The bus/archive/permission entries above
  // are the less common siblings.
  CloudwatchEventRule = 'aws_cloudwatch_event_rule',
  CloudwatchEventTarget = 'aws_cloudwatch_event_target',
  CloudwatchEventConnection = 'aws_cloudwatch_event_connection',
  CloudwatchEventApiDestination = 'aws_cloudwatch_event_api_destination',
  // EventBridge modern families — Pipes (`aws_pipes_pipe`), EventBridge
  // Scheduler (`aws_scheduler_schedule` / `_schedule_group`), and the
  // CloudWatch Logs account-level delivery triplet (delivery / source /
  // destination). Newer than the legacy `aws_cloudwatch_event_*` names above;
  // recognized-but-not-rule-bearing.
  PipesPipe = 'aws_pipes_pipe',
  SchedulerSchedule = 'aws_scheduler_schedule',
  SchedulerScheduleGroup = 'aws_scheduler_schedule_group',
  CloudwatchLogDelivery = 'aws_cloudwatch_log_delivery',
  CloudwatchLogDeliveryDestination = 'aws_cloudwatch_log_delivery_destination',
  CloudwatchLogDeliverySource = 'aws_cloudwatch_log_delivery_source',
  CloudwatchQueryDefinition = 'aws_cloudwatch_query_definition',
  CloudwatchMetricStream = 'aws_cloudwatch_metric_stream',
  // Route53 / DNS / ACM
  Route53Record = 'aws_route53_record',
  Route53Zone = 'aws_route53_zone',
  Route53ZoneAssociation = 'aws_route53_zone_association',
  Route53HealthCheck = 'aws_route53_health_check',
  Route53DelegationSet = 'aws_route53_delegation_set',
  Route53QueryLog = 'aws_route53_query_log',
  Route53ResolverEndpoint = 'aws_route53_resolver_endpoint',
  Route53ResolverRule = 'aws_route53_resolver_rule',
  Route53ResolverRuleAssociation = 'aws_route53_resolver_rule_association',
  Route53ResolverDnssecConfig = 'aws_route53_resolver_dnssec_config',
  Route53ResolverFirewallDomainList = 'aws_route53_resolver_firewall_domain_list',
  Route53ResolverFirewallRuleGroup = 'aws_route53_resolver_firewall_rule_group',
  Route53ResolverFirewallRuleGroupAssociation = 'aws_route53_resolver_firewall_rule_group_association',
  Route53ResolverFirewallConfig = 'aws_route53_resolver_firewall_config',
  Route53VpcAssociationAuthorization = 'aws_route53_vpc_association_authorization',
  Route53DomainsRegisteredDomain = 'aws_route53domains_registered_domain',
  AcmCertificate = 'aws_acm_certificate',
  AcmCertificateValidation = 'aws_acm_certificate_validation',
  // EKS / ECS
  EksNodeGroup = 'aws_eks_node_group',
  EksAddon = 'aws_eks_addon',
  EksIdentityProviderConfig = 'aws_eks_identity_provider_config',
  EksFargateProfile = 'aws_eks_fargate_profile',
  EksPodIdentityAssociation = 'aws_eks_pod_identity_association',
  EcsCluster = 'aws_ecs_cluster',
  EcsCapacityProvider = 'aws_ecs_capacity_provider',
  EcsTaskSet = 'aws_ecs_task_set',
  // RDS / database
  RdsGlobalCluster = 'aws_rds_global_cluster',
  RdsClusterEndpoint = 'aws_rds_cluster_endpoint',
  RdsClusterRoleAssociation = 'aws_rds_cluster_role_association',
  RedshiftClusterIamRoles = 'aws_redshift_cluster_iam_roles',
  RedshiftSnapshotSchedule = 'aws_redshift_snapshot_schedule',
  RedshiftSnapshotScheduleAssociation = 'aws_redshift_snapshot_schedule_association',
  RedshiftParameterGroup = 'aws_redshift_parameter_group',
  RedshiftSubnetGroup = 'aws_redshift_subnet_group',
  DocdbCluster = 'aws_docdb_cluster',
  DocdbClusterInstance = 'aws_docdb_cluster_instance',
  DocdbClusterParameterGroup = 'aws_docdb_cluster_parameter_group',
  DocdbSubnetGroup = 'aws_docdb_subnet_group',
  NeptuneCluster = 'aws_neptune_cluster',
  NeptuneClusterInstance = 'aws_neptune_cluster_instance',
  NeptuneClusterParameterGroup = 'aws_neptune_cluster_parameter_group',
  NeptuneSubnetGroup = 'aws_neptune_subnet_group',
  // EFS / FSx
  EfsAccessPoint = 'aws_efs_access_point',
  EfsMountTarget = 'aws_efs_mount_target',
  EfsFileSystemPolicy = 'aws_efs_file_system_policy',
  FsxOntapFileSystem = 'aws_fsx_ontap_file_system',
  FsxWindowsFileSystem = 'aws_fsx_windows_file_system',
  FsxLustreFileSystem = 'aws_fsx_lustre_file_system',
  // KMS / secrets / SSM
  KmsAlias = 'aws_kms_alias',
  KmsExternalKey = 'aws_kms_external_key',
  KmsGrant = 'aws_kms_grant',
  KmsKeyPolicy = 'aws_kms_key_policy',
  SecretsmanagerSecretPolicy = 'aws_secretsmanager_secret_policy',
  SsmActivation = 'aws_ssm_activation',
  SsmAssociation = 'aws_ssm_association',
  SsmDocument = 'aws_ssm_document',
  SsmMaintenanceWindow = 'aws_ssm_maintenance_window',
  SsmMaintenanceWindowTarget = 'aws_ssm_maintenance_window_target',
  SsmMaintenanceWindowTask = 'aws_ssm_maintenance_window_task',
  SsmPatchBaseline = 'aws_ssm_patch_baseline',
  SsmServiceSetting = 'aws_ssm_service_setting',
  // CloudTrail / Config / Audit
  CloudtrailEventDataStore = 'aws_cloudtrail_event_data_store',
  ConfigAggregationAuthorization = 'aws_config_aggregate_authorization',
  ConfigConfigurationAggregator = 'aws_config_configuration_aggregator',
  ConfigDeliveryChannel = 'aws_config_delivery_channel',
  ConfigConformancePack = 'aws_config_conformance_pack',
  ConfigOrganizationConformancePack = 'aws_config_organization_conformance_pack',
  ConfigOrganizationCustomRule = 'aws_config_organization_custom_rule',
  ConfigOrganizationManagedRule = 'aws_config_organization_managed_rule',
  ConfigRemediationConfiguration = 'aws_config_remediation_configuration',
  // SQS / SNS / Kinesis / EventBridge
  SqsQueue = 'aws_sqs_queue',
  SqsQueuePolicy = 'aws_sqs_queue_policy',
  SnsTopic = 'aws_sns_topic',
  SnsTopicPolicy = 'aws_sns_topic_policy',
  SnsTopicSubscription = 'aws_sns_topic_subscription',
  SnsPlatformApplication = 'aws_sns_platform_application',
  SnsSmsPreferences = 'aws_sns_sms_preferences',
  KinesisStream = 'aws_kinesis_stream',
  KinesisFirehoseDeliveryStream = 'aws_kinesis_firehose_delivery_stream',
  KinesisStreamConsumer = 'aws_kinesis_stream_consumer',
  KinesisAnalyticsApplication = 'aws_kinesis_analytics_application',
  KinesisVideoStream = 'aws_kinesis_video_stream',
  // ALB/NLB continued
  LbTargetGroup = 'aws_lb_target_group',
  LbTargetGroupAttachment = 'aws_lb_target_group_attachment',
  LbListenerCertificate = 'aws_lb_listener_certificate',
  LbListenerRule = 'aws_lb_listener_rule',
  LbTrustStore = 'aws_lb_trust_store',
  // Lambda
  LambdaEventSourceMapping = 'aws_lambda_event_source_mapping',
  LambdaFunctionEventInvokeConfig = 'aws_lambda_function_event_invoke_config',
  LambdaFunctionUrl = 'aws_lambda_function_url',
  LambdaFunctionRecursionConfig = 'aws_lambda_function_recursion_config',
  LambdaLayerVersion = 'aws_lambda_layer_version',
  LambdaPermission = 'aws_lambda_permission',
  LambdaAlias = 'aws_lambda_alias',
  LambdaProvisionedConcurrencyConfig = 'aws_lambda_provisioned_concurrency_config',
  LambdaCodeSigningConfig = 'aws_lambda_code_signing_config',
  // Elastic Beanstalk / AppRunner / Lightsail
  ElasticBeanstalkApplication = 'aws_elastic_beanstalk_application',
  ElasticBeanstalkEnvironment = 'aws_elastic_beanstalk_environment',
  ElasticBeanstalkApplicationVersion = 'aws_elastic_beanstalk_application_version',
  ElasticBeanstalkConfigurationTemplate = 'aws_elastic_beanstalk_configuration_template',
  ApprunnerService = 'aws_apprunner_service',
  ApprunnerVpcConnector = 'aws_apprunner_vpc_connector',
  ApprunnerObservabilityConfiguration = 'aws_apprunner_observability_configuration',
  ApprunnerAutoScalingConfigurationVersion = 'aws_apprunner_auto_scaling_configuration_version',
  LightsailInstance = 'aws_lightsail_instance',
  LightsailDomain = 'aws_lightsail_domain',
  LightsailStaticIp = 'aws_lightsail_static_ip',
  LightsailStaticIpAttachment = 'aws_lightsail_static_ip_attachment',
  LightsailDisk = 'aws_lightsail_disk',
  LightsailCertificate = 'aws_lightsail_certificate',
  LightsailContainerService = 'aws_lightsail_container_service',
  // GLUE / Athena / EMR / Step Functions
  GlueCatalogDatabase = 'aws_glue_catalog_database',
  GlueCatalogTable = 'aws_glue_catalog_table',
  GlueClassifier = 'aws_glue_classifier',
  GlueConnection = 'aws_glue_connection',
  GlueCrawler = 'aws_glue_crawler',
  GlueJob = 'aws_glue_job',
  GlueTrigger = 'aws_glue_trigger',
  GlueWorkflow = 'aws_glue_workflow',
  GlueSecurityConfiguration = 'aws_glue_security_configuration',
  AthenaDatabase = 'aws_athena_database',
  AthenaNamedQuery = 'aws_athena_named_query',
  AthenaWorkgroup = 'aws_athena_workgroup',
  AthenaDataCatalog = 'aws_athena_data_catalog',
  EmrCluster = 'aws_emr_cluster',
  EmrInstanceGroup = 'aws_emr_instance_group',
  EmrManagedScalingPolicy = 'aws_emr_managed_scaling_policy',
  EmrSecurityConfiguration = 'aws_emr_security_configuration',
  EmrInstanceFleet = 'aws_emr_instance_fleet',
  SfnActivity = 'aws_sfn_activity',
  SfnStateMachine = 'aws_sfn_state_machine',
  // CloudFront / WAF / Shield / Global Accelerator
  CloudfrontDistribution = 'aws_cloudfront_distribution',
  CloudfrontCachePolicy = 'aws_cloudfront_cache_policy',
  CloudfrontOriginAccessIdentity = 'aws_cloudfront_origin_access_identity',
  CloudfrontOriginRequestPolicy = 'aws_cloudfront_origin_request_policy',
  CloudfrontResponseHeadersPolicy = 'aws_cloudfront_response_headers_policy',
  CloudfrontPublicKey = 'aws_cloudfront_public_key',
  CloudfrontRealtimeLogConfig = 'aws_cloudfront_realtime_log_config',
  CloudfrontFieldLevelEncryptionConfig = 'aws_cloudfront_field_level_encryption_config',
  CloudfrontFieldLevelEncryptionProfile = 'aws_cloudfront_field_level_encryption_profile',
  CloudfrontFunction = 'aws_cloudfront_function',
  CloudfrontKeyGroup = 'aws_cloudfront_key_group',
  CloudfrontMonitoringSubscription = 'aws_cloudfront_monitoring_subscription',
  CloudfrontOriginAccessControl = 'aws_cloudfront_origin_access_control',
  WafWebAcl = 'aws_waf_web_acl',
  WafRule = 'aws_waf_rule',
  WafRuleGroup = 'aws_waf_rule_group',
  WafIpset = 'aws_waf_ipset',
  WafByteMatchSet = 'aws_waf_byte_match_set',
  WafSqlInjectionMatchSet = 'aws_waf_sql_injection_match_set',
  WafXssMatchSet = 'aws_waf_xss_match_set',
  WafRegexPatternSet = 'aws_waf_regex_pattern_set',
  WafRateBasedRule = 'aws_waf_rate_based_rule',
  Wafv2WebAcl = 'aws_wafv2_web_acl',
  Wafv2RuleGroup = 'aws_wafv2_rule_group',
  Wafv2IpSet = 'aws_wafv2_ip_set',
  Wafv2RegexPatternSet = 'aws_wafv2_regex_pattern_set',
  Wafv2WebAclAssociation = 'aws_wafv2_web_acl_association',
  ShieldProtection = 'aws_shield_protection',
  ShieldProtectionGroup = 'aws_shield_protection_group',
  ShieldProactiveEngagement = 'aws_shield_proactive_engagement',
  ShieldApplicationLayerAutomaticResponse = 'aws_shield_application_layer_automatic_response',
  GlobalacceleratorAccelerator = 'aws_globalaccelerator_accelerator',
  GlobalacceleratorEndpointGroup = 'aws_globalaccelerator_endpoint_group',
  GlobalacceleratorListener = 'aws_globalaccelerator_listener',
  // DynamoDB / ElastiCache / MQ / MSK / Neptune cont.
  DynamodbGlobalTable = 'aws_dynamodb_global_table',
  DynamodbTableReplica = 'aws_dynamodb_table_replica',
  DynamodbKinesisStreamingDestination = 'aws_dynamodb_kinesis_streaming_destination',
  DynamodbContributorInsights = 'aws_dynamodb_contributor_insights',
  ElasticacheCluster = 'aws_elasticache_cluster',
  ElasticacheParameterGroup = 'aws_elasticache_parameter_group',
  ElasticacheSubnetGroup = 'aws_elasticache_subnet_group',
  ElasticacheUser = 'aws_elasticache_user',
  ElasticacheUserGroup = 'aws_elasticache_user_group',
  ElasticacheUserGroupAssociation = 'aws_elasticache_user_group_association',
  MqBroker = 'aws_mq_broker',
  MqConfiguration = 'aws_mq_configuration',
  MskCluster = 'aws_msk_cluster',
  MskConfiguration = 'aws_msk_configuration',
  MskServerlessCluster = 'aws_msk_serverless_cluster',
  MskScramSecretAssociation = 'aws_msk_scram_secret_association',
  // VPC Lattice / Verified Access / Network Firewall
  VpclatticeService = 'aws_vpclattice_service',
  VpclatticeTargetGroup = 'aws_vpclattice_target_group',
  VpclatticeListener = 'aws_vpclattice_listener',
  VpclatticeServiceNetwork = 'aws_vpclattice_service_network',
  VerifiedaccessInstance = 'aws_verifiedaccess_instance',
  VerifiedaccessTrustProvider = 'aws_verifiedaccess_trust_provider',
  NetworkfirewallFirewall = 'aws_networkfirewall_firewall',
  NetworkfirewallFirewallPolicy = 'aws_networkfirewall_firewall_policy',
  NetworkfirewallRuleGroup = 'aws_networkfirewall_rule_group',
  NetworkfirewallLoggingConfiguration = 'aws_networkfirewall_logging_configuration',
  NetworkfirewallResourcePolicy = 'aws_networkfirewall_resource_policy',
  // SES / Pinpoint / Connect
  SesActiveReceiptRuleSet = 'aws_ses_active_receipt_rule_set',
  SesConfigurationSet = 'aws_ses_configuration_set',
  SesDomainDkim = 'aws_ses_domain_dkim',
  SesDomainIdentity = 'aws_ses_domain_identity',
  SesDomainMailFrom = 'aws_ses_domain_mail_from',
  SesEmailIdentity = 'aws_ses_email_identity',
  SesEventDestination = 'aws_ses_event_destination',
  SesReceiptFilter = 'aws_ses_receipt_filter',
  SesReceiptRule = 'aws_ses_receipt_rule',
  SesReceiptRuleSet = 'aws_ses_receipt_rule_set',
  SesTemplate = 'aws_ses_template',
  PinpointApp = 'aws_pinpoint_app',
  PinpointSmsChannel = 'aws_pinpoint_sms_channel',
  ConnectInstance = 'aws_connect_instance',
  ConnectContactFlow = 'aws_connect_contact_flow',
  ConnectHoursOfOperation = 'aws_connect_hours_of_operation',
  ConnectQuickConnect = 'aws_connect_quick_connect',
  ConnectQueue = 'aws_connect_queue',
  ConnectRoutingProfile = 'aws_connect_routing_profile',
  ConnectSecurityProfile = 'aws_connect_security_profile',
  ConnectUser = 'aws_connect_user',
  ConnectInstanceStorageConfig = 'aws_connect_instance_storage_config',
  // Backup / DR / DisasterRecovery
  BackupPlan = 'aws_backup_plan',
  BackupSelection = 'aws_backup_selection',
  BackupVault = 'aws_backup_vault',
  BackupVaultLockConfiguration = 'aws_backup_vault_lock_configuration',
  BackupVaultNotifications = 'aws_backup_vault_notifications',
  BackupVaultPolicy = 'aws_backup_vault_policy',
  BackupReportPlan = 'aws_backup_report_plan',
  BackupFramework = 'aws_backup_framework',
  BackupGlobalSettings = 'aws_backup_global_settings',
  BackupRegionSettings = 'aws_backup_region_settings',
  DrsReplicationConfigurationTemplate = 'aws_drs_replication_configuration_template',
  // DAX / Qldb / Timestream / MN Data
  DaxCluster = 'aws_dax_cluster',
  DaxParameterGroup = 'aws_dax_parameter_group',
  DaxSubnetGroup = 'aws_dax_subnet_group',
  QldbLedger = 'aws_qldb_ledger',
  QldbStream = 'aws_qldb_stream',
  TimestreamwriteDatabase = 'aws_timestreamwrite_database',
  TimestreamwriteTable = 'aws_timestreamwrite_table',
  TimestreamqueryScheduledQuery = 'aws_timestreamquery_scheduled_query',
  // MemoryDB / OpenSearch / Neptune / DocumentDB cont.
  MemorydbCluster = 'aws_memorydb_cluster',
  MemorydbAcl = 'aws_memorydb_acl',
  MemorydbParameterGroup = 'aws_memorydb_parameter_group',
  MemorydbSubnetGroup = 'aws_memorydb_subnet_group',
  MemorydbUser = 'aws_memorydb_user',
  OpensearchDomain = 'aws_opensearch_domain',
  OpensearchDomainPolicy = 'aws_opensearch_domain_policy',
  OpensearchDomainSamlOptions = 'aws_opensearch_domain_saml_options',
  OpensearchOutboundConnection = 'aws_opensearch_outbound_connection',
  // RAM / Macie / GuardDuty / Detective / SecurityHub / Inspector / AccessAnalyzer cont.
  RamResourceShare = 'aws_ram_resource_share',
  RamResourceShareAccepter = 'aws_ram_resource_share_accepter',
  RamResourceAssociation = 'aws_ram_resource_association',
  RamPrincipalAssociation = 'aws_ram_principal_association',
  Macie2ClassificationJob = 'aws_macie2_classification_job',
  Macie2CustomDataIdentifier = 'aws_macie2_custom_data_identifier',
  Macie2FindingsFilter = 'aws_macie2_findings_filter',
  Macie2InvitationAccepter = 'aws_macie2_invitation_accepter',
  Macie2Member = 'aws_macie2_member',
  Macie2Account = 'aws_macie2_account',
  GuarddutyDetector = 'aws_guardduty_detector',
  GuarddutyFilter = 'aws_guardduty_filter',
  GuarddutyInviteAccepter = 'aws_guardduty_invite_accepter',
  GuarddutyIpset = 'aws_guardduty_ipset',
  GuarddutyMember = 'aws_guardduty_member',
  GuarddutyThreatintelset = 'aws_guardduty_threatintelset',
  GuarddutyPublishingDestination = 'aws_guardduty_publishing_destination',
  DetectiveGraph = 'aws_detective_graph',
  DetectiveMember = 'aws_detective_member',
  DetectiveInvitationAccepter = 'aws_detective_invitation_accepter',
  DetectiveOrganizationConfiguration = 'aws_detective_organization_configuration',
  SecurityhubAccount = 'aws_securityhub_account',
  SecurityhubStandardsSubscription = 'aws_securityhub_standards_subscription',
  SecurityhubInsight = 'aws_securityhub_insight',
  SecurityhubOrganizationAdminAccount = 'aws_securityhub_organization_admin_account',
  SecurityhubMember = 'aws_securityhub_member',
  SecurityhubProductSubscription = 'aws_securityhub_product_subscription',
  SecurityhubActionTarget = 'aws_securityhub_action_target',
  SecurityhubFindingAggregator = 'aws_securityhub_finding_aggregator',
  Inspector2DelegatedAdminAccount = 'aws_inspector2_delegated_admin_account',
  Inspector2Enabler = 'aws_inspector2_enabler',
  Inspector2MemberAssociation = 'aws_inspector2_member_association',
  Inspector2OrganizationConfiguration = 'aws_inspector2_organization_configuration',
  // Logs / Trails / Auditing extra
  Cloud9EnvironmentEc2 = 'aws_cloud9_environment_ec2',
  Cloud9EnvironmentMembership = 'aws_cloud9_environment_membership',
  // Elastic IP / Carrier / Outposts
  Eip = 'aws_eip',
  EipAssociation = 'aws_eip_association',
  // Resource Groups / TAGs / Pricing
  ResourcegroupsGroup = 'aws_resourcegroups_group',
  // Marketplace / Catalog
  // CodeCommit / CodeBuild / CodePipeline / CodeDeploy / CodeArtifact
  CodecommitRepository = 'aws_codecommit_repository',
  CodecommitTrigger = 'aws_codecommit_trigger',
  CodebuildProject = 'aws_codebuild_project',
  CodebuildReportGroup = 'aws_codebuild_report_group',
  CodebuildWebhook = 'aws_codebuild_webhook',
  CodebuildSourceCredential = 'aws_codebuild_source_credential',
  Codepipeline = 'aws_codepipeline',
  CodepipelineWebhook = 'aws_codepipeline_webhook',
  CodepipelineCustomActionType = 'aws_codepipeline_custom_action_type',
  CodedeployApp = 'aws_codedeploy_app',
  CodedeployDeploymentConfig = 'aws_codedeploy_deployment_config',
  CodedeployDeploymentGroup = 'aws_codedeploy_deployment_group',
  CodeartifactDomain = 'aws_codeartifact_domain',
  CodeartifactRepository = 'aws_codeartifact_repository',
  CodeartifactDomainPermissionsPolicy = 'aws_codeartifact_domain_permissions_policy',
  CodeartifactRepositoryPermissionsPolicy = 'aws_codeartifact_repository_permissions_policy',
  // Misc recognized-but-not-rule-bearing yet
  OrganizationsAccount = 'aws_organizations_account',
  OrganizationsOrganization = 'aws_organizations_organization',
  OrganizationsOrganizationalUnit = 'aws_organizations_organizational_unit',
  OrganizationsPolicy = 'aws_organizations_policy',
  OrganizationsPolicyAttachment = 'aws_organizations_policy_attachment',
  OrganizationsDelegatedAdministrator = 'aws_organizations_delegated_administrator',
  SsoadminPermissionSet = 'aws_ssoadmin_permission_set',
  SsoadminAccountAssignment = 'aws_ssoadmin_account_assignment',
  SsoadminManagedPolicyAttachment = 'aws_ssoadmin_managed_policy_attachment',
  SsoadminPermissionsBoundaryAttachment = 'aws_ssoadmin_permissions_boundary_attachment',
  SsoadminInstanceAccessControlAttributes = 'aws_ssoadmin_instance_access_control_attributes',
  TransferServer = 'aws_transfer_server',
  TransferUser = 'aws_transfer_user',
  TransferAccess = 'aws_transfer_access',
  TransferWorkflow = 'aws_transfer_workflow',
  TransferAgreement = 'aws_transfer_agreement',
  TransferCertificate = 'aws_transfer_certificate',
  TransferConnector = 'aws_transfer_connector',
  TransferProfile = 'aws_transfer_profile',
  Cloudhsmv2Cluster = 'aws_cloudhsm_v2_cluster',
  Cloudhsmv2Hsm = 'aws_cloudhsm_v2_hsm',
  // X-Ray / ApplicationSignals / DevOpsGuru
  XrayEncryptionConfig = 'aws_xray_encryption_config',
  XrayGroup = 'aws_xray_group',
  XraySamplingRule = 'aws_xray_sampling_rule',
  ApplicationinsightsApplication = 'aws_applicationinsights_application',
  DevopsguruEventSourcesConfig = 'aws_devopsguru_event_sources_config',
  DevopsguruNotificationChannel = 'aws_devopsguru_notification_channel',
  DevopsguruResourceCollection = 'aws_devopsguru_resource_collection',
  DevopsguruServiceIntegrationConfig = 'aws_devopsguru_service_integration',
  // Schemas / ECR Public / Appflow
  SchemasDiscoverer = 'aws_schemas_discoverer',
  SchemasRegistry = 'aws_schemas_registry',
  SchemasSchema = 'aws_schemas_schema',
  EcrpublicRepository = 'aws_ecrpublic_repository',
  AppflowFlow = 'aws_appflow_flow',
  AppflowConnectorProfile = 'aws_appflow_connector_profile',
  // IAM Identity Center (successor to SSO)
  IdentitystoreGroup = 'aws_identitystore_group',
  IdentitystoreUser = 'aws_identitystore_user',
  IdentitystoreGroupMembership = 'aws_identitystore_group_membership',
  // AppConfig / Amplify
  AppconfigApplication = 'aws_appconfig_application',
  AppconfigConfigurationProfile = 'aws_appconfig_configuration_profile',
  AppconfigDeployment = 'aws_appconfig_deployment',
  AppconfigDeploymentStrategy = 'aws_appconfig_deployment_strategy',
  AppconfigEnvironment = 'aws_appconfig_environment',
  AppconfigHostedConfigurationVersion = 'aws_appconfig_hosted_configuration_version',
  AmplifyApp = 'aws_amplify_app',
  AmplifyBranch = 'aws_amplify_branch',
  AmplifyDomainAssociation = 'aws_amplify_domain_association',
  AmplifyWebhook = 'aws_amplify_webhook',
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
  // AWS Lambda
  TracingMode = 'tracing_config.mode',
  LambdaKmsKeyArn = 'kms_key_arn',
  // ElastiCache replication group
  AtRestEncryptionEnabled = 'at_rest_encryption_enabled',
  TransitEncryptionEnabled = 'transit_encryption_enabled',
  // SSM parameter — a `String` (not `SecureString`) parameter with a
  // secret-shaped name is a plaintext secret leak. Govern with denyValue.
  SsmParameterType = 'type',
  // IAM role — the assume_role_policy JSON (govern with denyIamWildcard /
  // denyPublicPrincipal, same as aws_iam_policy).
  IamRoleAssumeRolePolicy = 'assume_role_policy',
  // IAM role policy attachment — which managed policy is attached.
  IamRolePolicyAttachmentPolicyArn = 'policy_arn',
  // CloudWatch log group — retention must be set (not never-expire / 0).
  RetentionInDays = 'retention_in_days',
  // SQS queue / SNS topic — KMS encryption at rest for messages.
  KmsMasterKeyId = 'kms_master_key_id',
  // EKS node group — the `remote_access` block (SSH key + SG). Its presence
  // means direct SSH access to nodes is enabled; SSM Session Manager is the
  // safer alternative. Govern with `denyBlockPresence(Block.RemoteAccess)`.
  EksNodeGroupRemoteAccessSshKey = 'remote_access.ec2_ssh_key',
  // ECR lifecycle policy — links to the repository by name.
  Repository = 'repository',
  // IAM user policy — links to the user by name.
  User = 'user',
  // IAM role policy — links to the role by name.
  Role = 'role',
  // IAM group policy — links to the group by name.
  Group = 'group',
  // WAFv2 web ACL association — links to the protected resource via ARN.
  ResourceArn = 'resource_arn',
  // ECS cluster — the `setting` block with `name = "containerInsights"` and
  // `value = "enabled"`. Flattened to `setting.name` and `setting.value`.
  EcsSettingName = 'setting.name',
  EcsSettingValue = 'setting.value',
}

// Known weak ELB TLS policies (permit TLS 1.0/1.1). Use with `denyValue`.
export enum TlsPolicy {
  Legacy2015 = 'ELBSecurityPolicy-2015-05',
  Tls10 = 'ELBSecurityPolicy-TLS-1-0-2015-04',
  Tls11 = 'ELBSecurityPolicy-TLS-1-1-2017-01',
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

// AWS Lambda X-Ray tracing modes (for `mustEqual` on tracing_config.mode).
export enum XrayMode {
  Active = 'Active',
  PassThrough = 'PassThrough',
}

// S3 ACL values (the `acl` attribute on `aws_s3_bucket_acl` — inline `acl`
// was deprecated in AWS provider v4). Govern with `denyAcl`.
export enum Acl {
  Private = 'private',
  PublicRead = 'public-read',
  PublicReadWrite = 'public-read-write',
}

// AWS API Gateway method authorization types. `NONE` = unauthenticated.
export enum ApiGatewayAuthorization {
  None = 'NONE',
}
