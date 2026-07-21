import { rule, AwsResource, AwsAttribute } from '../../../../../src/index'

export const spec = [
  rule()
    .resource(AwsResource.S3Bucket)
    .mustHaveAssociated(
      AwsResource.S3BucketServerSideEncryptionConfiguration,
      AwsAttribute.Bucket,
    )
    .message('S3 buckets must have server-side encryption configured')
    .rationale(
      'A bucket with no SSE-config resource stores data unencrypted at rest',
    ),
]
