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
}

export enum DataAttribute {
  // `data.aws_ami` — the account IDs allowed to publish the AMI you select.
  // A missing `owners` lets Terraform return ANY AMI matching the filters,
  // including third-party ones — a supply-chain risk.
  AmiOwners = 'owners',
}
