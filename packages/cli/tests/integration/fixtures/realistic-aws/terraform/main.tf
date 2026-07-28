# ── Variables ────────────────────────────────────────────────────────────

variable "environment" {
  description = "Deployment environment (dev, stg, prd)"
  type        = string
  default     = "dev"
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "appdb"
}

variable "db_engine" {
  description = "Database engine"
  type        = string
  default     = "postgres"
}

variable "db_engine_version" {
  description = "Engine version"
  type        = string
  default     = "15.4"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "db_backup_retention_days" {
  description = "Backup retention period in days (dev default 7; prd uses 30 via ternary)"
  type        = number
  default     = 7
}

variable "db_storage_encrypted" {
  description = "Encrypt storage at rest"
  type        = bool
  default     = true
}

variable "db_master_password" {
  description = "Master database password (sensitive — supply via var / secret manager)"
  type        = string
  sensitive   = true
}

variable "vpc_id" {
  description = "VPC ID where resources will be created"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for the DB subnet group"
  type        = list(string)
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to reach the database on its port"
  type        = list(string)
  default     = ["10.0.0.0/8"]
}

variable "db_port" {
  description = "Database port"
  type        = number
  default     = 5432
}

variable "enable_monitoring" {
  description = "Enable enhanced monitoring + KMS key creation"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags to merge into common_tags"
  type        = map(string)
  default     = {}
}

# ── Locals ───────────────────────────────────────────────────────────────
# is_production drives ternaries (backup retention, multi_az). The engine
# resolves the bare comparison local to a boolean (ROADMAP #3 fix), so
# `deletion_protection = local.is_production` evaluates concretely.
#
# common_tags uses LOWERCASE keys (team / cost_center / environment) to
# MATCH the Tag enum values, so required-ownership-tags PASSES here.

locals {
  is_production = var.environment == "prd"

  common_tags = merge(var.tags, {
    environment = var.environment
    managed_by  = "terraform"
    team        = "platform"
    cost_center = "cc-1001"
  })
}

# ── Random password (utility type — silently skipped by UTILITY_TYPES) ───

resource "random_password" "db_password" {
  count   = var.db_master_password == null ? 1 : 0
  length  = 32
  special = true
}

# ── KMS key (created when monitoring enabled; rotation enforced) ─────────

resource "aws_kms_key" "db" {
  count                   = var.enable_monitoring ? 1 : 0
  description             = "KMS key for ${var.environment} encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30

  tags = local.common_tags
}

resource "aws_kms_alias" "db" {
  count        = var.enable_monitoring ? 1 : 0
  name         = "alias/${var.environment}-db"
  target_key_id = aws_kms_key.db[0].key_id
}

# ── DB Subnet Group ─────────────────────────────────────────────────────

resource "aws_db_subnet_group" "this" {
  name       = "${var.environment}-${var.db_name}-sng"
  subnet_ids = var.subnet_ids

  tags = local.common_tags
}

# ── Security Group ───────────────────────────────────────────────────────
# Ingress on var.db_port (default 5432 = Postgres) from a private CIDR
# (10.0.0.0/8) — denyIngress(Postgres, MySQL) does NOT fire because the
# CIDR is not 0.0.0.0/0.

resource "aws_security_group" "db" {
  name        = "${var.environment}-${var.db_name}-sg"
  description = "Allow inbound traffic to the ${var.db_name} database"
  vpc_id      = var.vpc_id

  ingress {
    description = "Database access from allowed CIDRs"
    from_port   = var.db_port
    to_port     = var.db_port
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

# ── RDS Instance ─────────────────────────────────────────────────────────
# backup_retention_period uses a ternary whose false branch is a REFERENCE
# (var.db_backup_retention_days). The conservative ternary evaluator only
# resolves scalar branches — a ref branch stays unresolved → degrades
# honestly to could-not-evaluate (the OPEN follow-on to ROADMAP #3).
# multi_az uses two scalar literals → resolves. deletion_protection is a
# bare ref to the boolean local.is_production → resolves (ROADMAP #3).

resource "aws_db_instance" "this" {
  identifier             = "${var.environment}-${var.db_name}"
  engine                 = var.db_engine
  engine_version         = var.db_engine_version
  instance_class         = var.db_instance_class
  allocated_storage      = var.db_allocated_storage
  storage_type           = "gp3"
  storage_encrypted      = var.db_storage_encrypted
  kms_key_id             = var.enable_monitoring ? aws_kms_key.db[0].arn : null

  db_name                = var.db_name
  username               = "dbadmin"
  password               = coalesce(var.db_master_password, random_password.db_password[0].result)

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  multi_az               = local.is_production ? true : false
  backup_retention_period = local.is_production ? 30 : var.db_backup_retention_days
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
  deletion_protection    = local.is_production
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot  = true
  monitoring_interval    = 30
  monitoring_role_arn    = aws_iam_role.rds_monitoring.arn

  tags = local.common_tags
}

# ── DB Parameter Group ──────────────────────────────────────────────────

resource "aws_db_parameter_group" "this" {
  name   = "${var.environment}-${var.db_name}-pg"
  family = "postgres15"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  tags = local.common_tags
}

# ── Enhanced Monitoring IAM Role ─────────────────────────────────────────

resource "aws_iam_role" "rds_monitoring" {
  name = "${var.environment}-${var.db_name}-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "monitoring.rds.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# ── Lambda processor (exercises LambdaFunction vocabulary + tracing) ─────

resource "aws_iam_policy" "processor" {
  name        = "${var.environment}-processor-policy"
  description = "Permissions for the ${var.environment} processor Lambda"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage"]
      Resource = "*"
    }]
  })
}

resource "aws_lambda_function" "processor" {
  function_name = "${var.environment}-processor"
  role          = aws_iam_role.rds_monitoring.arn
  runtime       = "python3.11"
  handler       = "index.handler"
  memory_size   = 256
  timeout       = 30

  tracing_config {
    mode = "Active"
  }

  kms_key_arn = var.enable_monitoring ? aws_kms_key.db[0].arn : null

  environment {
    variables = {
      LOG_LEVEL = "INFO"
    }
  }

  tags = local.common_tags
}

resource "aws_lambda_permission" "processor" {
  statement_id  = "AllowExecutionFromSNS"
  action         = "lambda:InvokeFunction"
  function_name = aws_lambda_function.processor.function_name
  principal      = "sns.amazonaws.com"
}

# ── CloudWatch Logs + Alarm ──────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "db" {
  name              = "/${var.environment}/${var.db_name}"
  retention_in_days = 7

  tags = local.common_tags
}

resource "aws_cloudwatch_log_stream" "db" {
  name           = "rds-events"
  log_group_name = aws_cloudwatch_log_group.db.name
}

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "${var.environment}-${var.db_name}-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 85
  alarm_description   = "CPU utilization above 85% for ${var.db_name}"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.this.identifier
  }

  tags = local.common_tags
}

# ── S3 data bucket (encryption + versioning + public-access-block) ───────

resource "aws_s3_bucket" "data" {
  bucket = "${var.environment}-${var.db_name}-data"

  tags = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls        = true
  block_public_policy      = true
  ignore_public_acls       = true
  restrict_public_buckets  = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.enable_monitoring ? aws_kms_key.db[0].arn : null
    }
  }
}

resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id

  versioning {
    enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    id     = "expire-logs"
    status = "Enabled"

    expiration {
      days = 90
    }
  }
}

# ── SSM Parameter for DB endpoint (app discovery) ────────────────────────

resource "aws_ssm_parameter" "db_endpoint" {
  name        = "/${var.environment}/${var.db_name}/endpoint"
  type        = "String"
  value       = aws_db_instance.this.endpoint
  description = "RDS endpoint for ${var.db_name} in ${var.environment}"

  tags = local.common_tags
}

# ── SNS alerts + SQS DLQ ─────────────────────────────────────────────────

resource "aws_sns_topic" "alerts" {
  name = "${var.environment}-alerts"

  tags = local.common_tags
}

resource "aws_sns_topic_subscription" "alerts" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.dlq.arn
}

resource "aws_sqs_queue" "dlq" {
  name                       = "${var.environment}-processor-dlq"
  message_retention_seconds  = 1209600

  tags = local.common_tags
}

# ── Route53 record for the DB endpoint alias ────────────────────────────

resource "aws_route53_record" "db" {
  zone_id = "Z00000000000000000000"
  name    = "${var.db_name}.${var.environment}.internal"
  type    = "CNAME"
  ttl     = 60
  records = [aws_db_instance.this.address]
}

# ── EBS volume (recognized; encrypted attribute ungoverned by this spec) ─

resource "aws_ebs_volume" "data" {
  availability_zone = "us-east-1a"
  size              = 100
  encrypted         = true

  tags = local.common_tags
}

# ── DELIBERATELY UNGOVERNED resource ────────────────────────────────────
# aws_prometheus_workspace is NOT in AwsResource (nor a utility type), so
# it surfaces as a coverage gap in the `ungoverned` list.

resource "aws_prometheus_workspace" "monitoring" {
  alias = "${var.environment}-monitoring"

  tags = local.common_tags
}

# ── Local module call (exercises module-following) ──────────────────────

module "vpc" {
  source      = "./modules/vpc"
  environment = var.environment
}

# ── Outputs ──────────────────────────────────────────────────────────────

output "db_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.this.endpoint
}

output "db_arn" {
  description = "RDS instance ARN"
  value       = aws_db_instance.this.arn
  sensitive   = true
}

output "db_security_group_id" {
  description = "Security group ID for the database"
  value       = aws_security_group.db.id
}
