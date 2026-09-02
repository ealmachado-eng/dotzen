# AI-generated Terraform — "create a Terraform module for a web application on AWS"
#
# This fixture deliberately includes COMMON AI-GENERATED MISTAKES to test
# whether pluvian catches them. Every block below mirrors a real failure
# pattern from Copilot / ChatGPT / Claude outputs.

# ── Variables ────────────────────────────────────────────────────────────

variable "env" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "webapp"
}

# MISTAKE: secret-looking variable WITHOUT sensitive = true (AI often forgets)
variable "db_password" {
  description = "Database master password"
  type        = string
  default     = "SuperSecret123!"
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
  default     = "vpc-abc123"
}

# ── Locals ───────────────────────────────────────────────────────────────
# MISTAKE: ternary on a bare comparison (AI pattern). Both branches are
# scalars (30 / 7) so the engine should resolve this.

locals {
  is_prod = var.env == "prod"

  # Lowercase keys — these match the Tag enum (team / cost_center / environment).
  common_tags = {
    team        = "platform"
    cost_center = "cc-1001"
    environment = var.env
  }
}

# ── Security Group (SSH open to the internet — AI copy-paste default) ────
# MISTAKE: port 22 open to 0.0.0.0/0. Tags via merge(local.common_tags, {})
# (empty merge — AI cargo-cult pattern). SG tags resolve → tag rule PASSES.

resource "aws_security_group" "web" {
  name        = "${var.app_name}-sg"
  description = "Web security group"
  vpc_id      = var.vpc_id

  ingress {
    description = "SSH access"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {})
}

# ── RDS Instance (multiple AI mistakes) ──────────────────────────────────
# MISTAKE 1: storage_encrypted omitted (AI forgets).
# MISTAKE 2: publicly_accessible = true (AI copy-paste default).
# MISTAKE 3: password = "SuperSecret123!" hardcoded literal (not a reference).
# MISTAKE 4: tags use capital "Team" key (case mismatch — spec needs lowercase).
# MISTAKE 5: ternary backup_retention_period = local.is_prod ? 30 : 7 (resolves
#            to 7 in dev → PASSES the >=7 rule).

resource "aws_db_instance" "main" {
  engine                 = "postgres"
  engine_version         = "15.4"
  instance_class         = "db.t3.micro"
  allocated_storage      = 20
  db_name                = var.app_name
  username               = "dbadmin"
  password               = "SuperSecret123!"
  vpc_security_group_ids = [aws_security_group.web.id]
  publicly_accessible    = true
  backup_retention_period = local.is_prod ? 30 : 7
  multi_az               = local.is_prod ? true : false
  deletion_protection    = local.is_prod

  tags = {
    Team        = "platform"
    cost_center = "cc-1001"
    environment = var.env
  }
}

# ── EBS Volume (unencrypted — AI forgets) ────────────────────────────────

resource "aws_ebs_volume" "data" {
  availability_zone = "us-east-1a"
  size              = 100

  tags = local.common_tags
}

# ── KMS Key (no rotation — AI forgets) ───────────────────────────────────

resource "aws_kms_key" "app" {
  description             = "KMS key for ${var.app_name}"
  enable_key_rotation     = false
  deletion_window_in_days = 30
}

# ── S3 Bucket (no tags, no versioning, no logging — AI minimal output) ───
# MISTAKE: no tags at all (tag rule fires). No versioning, no access logging,
# no public access block (CIS rules fire).

resource "aws_s3_bucket" "data" {
  bucket = "${var.app_name}-data-${var.env}"
}

# ── CloudWatch Log Group (no retention — AI forgets) ─────────────────────

resource "aws_cloudwatch_log_group" "app" {
  name = "/${var.app_name}/${var.env}"

  tags = local.common_tags
}

# ── SQS Queue (no KMS — AI forgets) ──────────────────────────────────────

resource "aws_sqs_queue" "tasks" {
  name = "${var.app_name}-tasks"

  tags = local.common_tags
}

# ── ECR Repository (no lifecycle policy — AI forgets) ────────────────────
# Image scanning IS enabled (so image-scan rule passes); lifecycle policy
# is MISSING (CIS lifecycle rule fires).

resource "aws_ecr_repository" "app" {
  name                 = var.app_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
}

# ── ALB (no access logs — AI forgets) ────────────────────────────────────

resource "aws_lb" "web" {
  name               = "${var.app_name}-alb"
  internal           = false
  load_balancer_type = "application"
  subnets            = ["subnet-aaa", "subnet-bbb"]

  tags = local.common_tags
}

# ── IAM Role with INLINE policy (AI pattern — should use managed policy) ─
# MISTAKE: aws_iam_role_policy attached to the role (inline, not managed).
# The policy grants Action "*" Resource "*" — but denyIamWildcard only
# governs aws_iam_policy, NOT aws_iam_role_policy, so the wildcard is NOT
# caught (a real coverage gap). The inline-policy presence IS caught by
# iam-role-no-inline-policy (warn).

resource "aws_iam_role" "app_role" {
  name = "${var.app_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "app_inline" {
  name = "${var.app_name}-inline"
  role = aws_iam_role.app_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "*"
      Resource = "*"
    }]
  })
}

# ── random_password (utility type — silently skipped by UTILITY_TYPES) ───

resource "random_password" "api_token" {
  length  = 32
  special = true
}

# ── null_resource (utility type — silently skipped by UTILITY_TYPES) ─────

resource "null_resource" "provisioner" {
  triggers = {
    app_name = var.app_name
  }
}

# ── DELIBERATELY UNGOVERNED resource ────────────────────────────────────
# aws_prometheus_workspace is NOT in AwsResource (nor a utility type), so
# it surfaces as a coverage gap in the `ungoverned` list.

resource "aws_prometheus_workspace" "metrics" {
  alias = "${var.app_name}-metrics"

  tags = local.common_tags
}

# ── Outputs ──────────────────────────────────────────────────────────────

output "db_endpoint" {
  value = aws_db_instance.main.endpoint
}

output "bucket_name" {
  value = aws_s3_bucket.data.id
}
