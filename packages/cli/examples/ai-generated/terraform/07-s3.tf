# Modern AWS provider style: the ACL is a separate aws_s3_bucket_acl
# resource (the inline `acl` argument on aws_s3_bucket was deprecated in
# provider v4). dotzen governs the decomposed resource via a rule that
# targets aws_s3_bucket, so it catches a public ACL in either form.

resource "aws_s3_bucket" "public_assets" {
  bucket = "my-public-assets"
  tags = {
    team        = "web"
    cost_center = "cc-7"
    environment = "production"
  }
}

resource "aws_s3_bucket_acl" "public_assets" {
  bucket = aws_s3_bucket.public_assets.id
  acl    = "public-read" # violation
}

resource "aws_s3_bucket" "private_data" {
  bucket = "my-private-data"
  tags = {
    team        = "data"
    cost_center = "cc-42"
    environment = "production"
  }
}

resource "aws_s3_bucket_acl" "private_data" {
  bucket = aws_s3_bucket.private_data.id
  acl    = "private" # compliant
}

# private_data has encryption + versioning wired up as separate resources
# (the modern AWS provider shape) -> passes the cross-resource checks.
# public_assets has neither -> flagged for missing SSE + versioning.
resource "aws_s3_bucket_server_side_encryption_configuration" "private_data" {
  bucket = aws_s3_bucket.private_data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_versioning" "private_data" {
  bucket = aws_s3_bucket.private_data.id

  versioning_configuration {
    status = "Enabled"
  }
}

# A bucket policy granting Action "*" — over-permissive, flagged by
# denyIamWildcard (the same parser used for IAM policies).
# Also has no SSL Deny → flagged by requireSslOnlyPolicy.
resource "aws_s3_bucket_policy" "public_assets" {
  bucket = aws_s3_bucket.public_assets.id

  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Principal": "*", "Action": "*", "Resource": "*" }
  ]
}
POLICY
}

# private_data has an SSL-only bucket policy (Deny non-SSL transport)
# → passes requireSslOnlyPolicy. CIS AWS: bucket policies should reject HTTP.
resource "aws_s3_bucket_policy" "private_data" {
  bucket = aws_s3_bucket.private_data.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = ["arn:aws:s3:::my-private-data", "arn:aws:s3:::my-private-data/*"]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}
