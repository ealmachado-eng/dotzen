# Prompt: "an EBS volume, an EFS file system, and a KMS key for my app"
# Typical AI output leaves encryption/rotation at their insecure defaults.
resource "aws_ebs_volume" "data" {
  availability_zone = "us-east-1a"
  size              = 100
  # encrypted not set -> defaults to false
}

resource "aws_efs_file_system" "shared" {
  creation_token = "shared"
  encrypted      = false
}

resource "aws_kms_key" "app" {
  description = "app data key"
  # enable_key_rotation not set -> defaults to false
}

# A public-access block that doesn't actually block anything.
resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = "my-public-assets"
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}
