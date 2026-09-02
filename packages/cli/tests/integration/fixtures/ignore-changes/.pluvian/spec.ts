import { rule, AwsResource } from '../../../../../src/index'

export const spec = [
  // `lifecycle.ignore_changes` hides drift from Terraform. A resource that
  // silences drift on a security-critical attribute (here `tags`) bypasses
  // governance over that attribute — flag it. Entries are attribute paths
  // (hcl2json wraps bare identifiers as `${tags}`); `denyIgnoreChanges`
  // strips the wrapper.
  rule()
    .resource(AwsResource.S3Bucket)
    .denyIgnoreChanges('tags')
    .message('must not hide drift on the tags attribute via ignore_changes'),
]