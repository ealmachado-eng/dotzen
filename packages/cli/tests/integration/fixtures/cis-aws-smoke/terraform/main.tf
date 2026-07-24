# ── VIOLATIONS (CIS AWS preset must flag these) ─────────────────────────

# SSH open to the internet (CIS §5.2)
resource "aws_security_group" "bad_ssh" {
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Unencrypted RDS, public, no backup retention (multiple CIS violations)
resource "aws_db_instance" "bad_rds" {
  engine            = "postgres"
  instance_class    = "db.t3.micro"
  storage_encrypted = false
  publicly_accessible = true
  backup_retention_period = 1
  master_password   = var.db_password
}

# Unencrypted EBS volume
resource "aws_ebs_volume" "bad_vol" {
  availability_zone = "us-east-1a"
  size              = 100
  encrypted         = false
}

# S3 with public ACL
resource "aws_s3_bucket" "bad_bucket" {
  bucket = "bad-bucket"
  acl    = "public-read"
}

# KMS key without rotation
resource "aws_kms_key" "bad_key" {
  enable_key_rotation = false
}

# IAM policy with Action:*
resource "aws_iam_policy" "bad_policy" {
  name   = "bad"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "*"
      Resource = "*"
    }]
  })
}

# ── COMPLIANT (preset must NOT flag these) ──────────────────────────────

resource "aws_security_group" "good_ssh" {
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]
  }

  tags = {
    team        = "platform"
    cost_center = "cc1"
    environment = "production"
  }
}

resource "aws_db_instance" "good_rds" {
  engine            = "postgres"
  instance_class    = "db.t3.micro"
  storage_encrypted = true
  publicly_accessible = false
  backup_retention_period = 7
  deletion_protection = true
  master_password   = var.db_password

  tags = {
    team        = "platform"
    cost_center = "cc1"
    environment = "production"
  }
}

# ── Additional violations: binding-surface ──────────────────────────────

# A secret-looking variable WITHOUT sensitive = true (binding-surface rule)
variable "api_key" {
  default = "akiaxxxxxxxxxxxx"
}

# A local with a hardcoded secret (binding-surface rule)
locals {
  auth_token = "ghp_xxxxxxxxxxxx"
}

# ── Additional compliant: sensitive variable + non-secret local ────────

variable "safe_secret" {
  default   = "ref-to-secret"
  sensitive = true
}

locals {
  instance_count = 3
}
