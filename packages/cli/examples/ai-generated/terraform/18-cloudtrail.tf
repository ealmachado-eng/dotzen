# Prompt: "enable CloudTrail for my account"
# AI typically emits a bare single-region trail with no validation or KMS.

# Insecure: single-region, no log-file validation, no KMS encryption.
resource "aws_cloudtrail" "bad" {
  name           = "main"
  s3_bucket_name = "my-cloudtrail-logs"
  # is_multi_region_trail defaults to false     -> violation
  # enable_log_file_validation defaults to false -> violation
  # kms_key_id absent                            -> violation (mustBeSet)
}

# Hardened trail -> passes all three CloudTrail rules.
resource "aws_cloudtrail" "good" {
  name                          = "org"
  s3_bucket_name                = "my-cloudtrail-logs"
  is_multi_region_trail         = true
  enable_log_file_validation    = true
  kms_key_id                    = aws_kms_key.cloudtrail.arn
  include_global_service_events = true
}

resource "aws_kms_key" "cloudtrail" {
  description         = "CloudTrail log encryption"
  enable_key_rotation = true
}
