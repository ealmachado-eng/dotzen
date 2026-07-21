locals {
  bucket_id = aws_s3_bucket.main.id
}

# Bucket with SSE config wired through a local chain — must PASS.
# Real modules route the parent ref through a local indirection
# (`bucket = local.bucket_id` where `local.bucket_id = aws_s3_bucket.main.id`).
# Before the fix, the association index captured `local.bucket_id` and
# failed to link → a false violation on a well-built module.
resource "aws_s3_bucket" "main" {
  bucket = "main-bucket"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "main" {
  bucket = local.bucket_id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Bucket with NO SSE-config resource at all — must VIOLATE.
resource "aws_s3_bucket" "lonely" {
  bucket = "lonely-bucket"
}
