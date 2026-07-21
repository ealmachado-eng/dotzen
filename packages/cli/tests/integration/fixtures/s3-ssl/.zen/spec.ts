import { rule, AwsResource } from '../../../../../src/index'

export const spec = [
  rule()
    .resource(AwsResource.S3BucketPolicy)
    .requireSslOnlyPolicy()
    .message('S3 bucket policies must deny non-SSL transport')
    .rationale(
      'CIS AWS — bucket policies should reject HTTP (aws:SecureTransport=false)',
    ),

  rule()
    .resource(AwsResource.S3BucketPolicy)
    .denyPublicPrincipal()
    .message('S3 bucket policies must not grant public access (Principal "*")')
    .rationale('CIS AWS — no public Principal in Allow statements'),
]
