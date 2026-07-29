/**
 * Data source vocabulary (the `data "x" "y" {}` block). Kept in its own module
 * behind the shared `AnyResource`/`AnyAttribute` unions, like the cloud
 * providers. Data source type strings are prefixed `data.` so they never
 * collide with a managed-resource type of the same suffix (e.g.
 * `data.aws_ami` vs a hypothetical `aws_ami` resource).
 *
 * Note: a `data` block is a READ QUERY, not the resource itself — its
 * attributes are filters/arguments to the cloud API, so governance is over
 * the query (e.g. an `aws_ami` data source must declare `owners`, not grab
 * arbitrary third-party AMIs), not over the fetched object's properties.
 */

export enum DataResource {
  AwsAmi = 'data.aws_ami',
  // AWS account/identity data sources — read-only, no security surface, but
  // recognized so they don't surface as ungoverned noise on real module repos.
  AwsCallerIdentity = 'data.aws_caller_identity',
  AwsPartition = 'data.aws_partition',
  AwsRegion = 'data.aws_region',
  AwsAvailabilityZones = 'data.aws_availability_zones',
  AwsIamPolicyDocument = 'data.aws_iam_policy_document',
  AwsIamPolicy = 'data.aws_iam_policy',
  AwsCloudwatchLogGroup = 'data.aws_cloudwatch_log_group',
  AwsCanonicalUserId = 'data.aws_canonical_user_id',
  AwsEksCluster = 'data.aws_eks_cluster',
  AwsSsmParameter = 'data.aws_ssm_parameter',
  AwsSnsTopic = 'data.aws_sns_topic',
  AwsSubnet = 'data.aws_subnet',
  AwsVpc = 'data.aws_vpc',
  AwsSecurityGroup = 'data.aws_security_group',
  // Azure data sources — same rationale: read-only, no security surface.
  AzurermClientConfig = 'data.azurerm_client_config',
  AzurermResourceGroup = 'data.azurerm_resource_group',
  AzurermVirtualNetwork = 'data.azurerm_virtual_network',
  AzurermSubnet = 'data.azurerm_subnet',
  AzurermLogAnalyticsWorkspace = 'data.azurerm_log_analytics_workspace',
  AzurermUserAssignedIdentity = 'data.azurerm_user_assigned_identity',
  // GCP data sources — read-only.
  GoogleComputeZones = 'data.google_compute_zones',
  GoogleContainerEngineVersions = 'data.google_container_engine_versions',
  GoogleComputeSubnetwork = 'data.google_compute_subnetwork',
  GoogleClientConfig = 'data.google_client_config',
  GoogleClientOpenidUserinfo = 'data.google_client_openid_userinfo',
}

export enum DataAttribute {
  // `data.aws_ami` — the account IDs allowed to publish the AMI you select.
  // A missing `owners` lets Terraform return ANY AMI matching the filters,
  // including third-party ones — a supply-chain risk.
  AmiOwners = 'owners',
}
