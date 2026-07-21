# A compliant bucket policy: Deny non-SSL transport.
# The Deny statement with Condition Bool aws:SecureTransport=false
# satisfies requireSslOnlyPolicy → PASS.
# (Literal ARN strings are used inside jsonencode so the parser can
# statically evaluate the policy — bare resource refs inside jsonencode
# would degrade to could-not-evaluate.)
resource "aws_s3_bucket_policy" "ssl_enforced" {
  bucket = aws_s3_bucket.ssl_enforced.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = ["arn:aws:s3:::ssl-enforced-bucket", "arn:aws:s3:::ssl-enforced-bucket/*"]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

resource "aws_s3_bucket" "ssl_enforced" {
  bucket = "ssl-enforced-bucket"
}

# A violating bucket policy: Allow only, no Deny for non-SSL transport.
# requireSslOnlyPolicy flags this → VIOLATION.
resource "aws_s3_bucket_policy" "no_ssl" {
  bucket = aws_s3_bucket.no_ssl.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "arn:aws:s3:::no-ssl-bucket/*"
      }
    ]
  })
}

resource "aws_s3_bucket" "no_ssl" {
  bucket = "no-ssl-bucket"
}

# A bucket with NO bucket policy at all — requireSslOnlyPolicy does not
# apply (no aws_s3_bucket_policy resource for this bucket). The rule
# targets AwsResource.S3BucketPolicy, not S3Bucket, so this resource is
# not in scope. Combine with mustHaveAssociated if every bucket must
# have a policy.
resource "aws_s3_bucket" "no_policy" {
  bucket = "no-policy-bucket"
}
