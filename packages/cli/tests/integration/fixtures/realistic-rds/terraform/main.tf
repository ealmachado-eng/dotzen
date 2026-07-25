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
  description = "Backup retention period in days"
  type        = number
  default     = 7
}

variable "db_multi_az" {
  description = "Enable Multi-AZ for high availability"
  type        = bool
  default     = false
}

variable "db_storage_encrypted" {
  description = "Encrypt storage at rest"
  type        = bool
  default     = true
}

variable "db_kms_key_arn" {
  description = "KMS key ARN for storage encryption"
  type        = string
  default     = null
}

variable "db_master_password" {
  description = "Master database password"
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

# ── Locals ───────────────────────────────────────────────────────────────

locals {
  is_production = var.environment == "prd"

  common_tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "app-platform"
    Team        = "platform"
    CostCenter  = "cc-1001"
  }

  db_tags = merge(local.common_tags, {
    Name               = "${var.environment}-${var.db_name}"
    Resource           = "rds"
    DataClassification = "internal"
  })
}

# ── Random password (fallback if no var.db_master_password) ──────────────

resource "random_password" "db_password" {
  count   = var.db_master_password == null ? 1 : 0
  length  = 32
  special = true
}

# ── KMS key (if no ARN provided, create one) ─────────────────────────────

resource "aws_kms_key" "db" {
  count                   = var.db_kms_key_arn == null ? 1 : 0
  description             = "KMS key for ${var.environment} RDS encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30

  tags = merge(local.common_tags, {
    Name = "${var.environment}-db-kms"
  })
}

# ── DB Subnet Group ──────────────────────────────────────────────────────

resource "aws_db_subnet_group" "this" {
  name       = "${var.environment}-${var.db_name}-sng"
  subnet_ids = var.subnet_ids

  tags = merge(local.common_tags, {
    Name = "${var.environment}-${var.db_name}-sng"
  })
}

# ── Security Group ───────────────────────────────────────────────────────

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

  tags = merge(local.common_tags, {
    Name = "${var.environment}-${var.db_name}-sg"
  })
}

# ── RDS Instance ─────────────────────────────────────────────────────────

resource "aws_db_instance" "this" {
  identifier                = "${var.environment}-${var.db_name}"
  engine                    = var.db_engine
  engine_version            = var.db_engine_version
  instance_class            = var.db_instance_class
  allocated_storage         = var.db_allocated_storage
  storage_type              = "gp3"
  storage_encrypted         = var.db_storage_encrypted
  kms_key_id                = var.db_kms_key_arn != null ? var.db_kms_key_arn : aws_kms_key.db[0].arn

  db_name                     = var.db_name
  username                    = "dbadmin"
  password                    = coalesce(var.db_master_password, random_password.db_password[0].result)

  db_subnet_group_name       = aws_db_subnet_group.this.name
  vpc_security_group_ids     = [aws_security_group.db.id]
  publicly_accessible       = false
  multi_az                   = local.is_production ? true : var.db_multi_az
  backup_retention_period    = local.is_production ? 30 : var.db_backup_retention_days
  backup_window              = "03:00-04:00"
  maintenance_window         = "sun:04:00-sun:05:00"
  deletion_protection        = local.is_production
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true
  monitoring_interval        = 30
  monitoring_role_arn        = aws_iam_role.rds_enhanced_monitoring.arn

  tags = local.db_tags
}

# ── Enhanced Monitoring IAM Role ─────────────────────────────────────────

resource "aws_iam_role" "rds_enhanced_monitoring" {
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

  tags = merge(local.common_tags, {
    Name = "${var.environment}-${var.db_name}-monitoring-role"
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_enhanced_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# ── CloudWatch Alarms ────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name           = "${var.environment}-${var.db_name}-cpu-high"
  comparison_operator  = "GreaterThanThreshold"
  evaluation_periods   = 2
  metric_name          = "CPUUtilization"
  namespace            = "AWS/RDS"
  period               = 300
  statistic            = "Average"
  threshold            = 85
  alarm_description    = "CPU utilization above 85% for ${var.db_name}"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.this.identifier
  }

  tags = merge(local.common_tags, {
    Name = "${var.environment}-${var.db_name}-cpu-alarm"
  })
}

resource "aws_cloudwatch_metric_alarm" "disk_space_low" {
  alarm_name           = "${var.environment}-${var.db_name}-disk-low"
  comparison_operator  = "LessThanThreshold"
  evaluation_periods   = 1
  metric_name          = "FreeStorageSpace"
  namespace            = "AWS/RDS"
  period               = 300
  statistic            = "Average"
  threshold            = 5000000000
  alarm_description    = "Free disk space below 5 GB for ${var.db_name}"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.this.identifier
  }

  tags = merge(local.common_tags, {
    Name = "${var.environment}-${var.db_name}-disk-alarm"
  })
}

# ── DB Parameter Group ───────────────────────────────────────────────────

resource "aws_db_parameter_group" "this" {
  name   = "${var.environment}-${var.db_name}-pg"
  family = "postgres15"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  tags = merge(local.common_tags, {
    Name = "${var.environment}-${var.db_name}-pg"
  })
}

# ── SSM Parameter for DB endpoint (for app discovery) ────────────────────

resource "aws_ssm_parameter" "db_endpoint" {
  name        = "/${var.environment}/${var.db_name}/endpoint"
  type        = "String"
  value       = aws_db_instance.this.endpoint
  description = "RDS endpoint for ${var.db_name} in ${var.environment}"

  tags = merge(local.common_tags, {
    Name = "${var.environment}-${var.db_name}-endpoint-ssm"
  })
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

output "db_kms_key_arn" {
  description = "KMS key ARN used for encryption"
  value       = var.db_kms_key_arn != null ? var.db_kms_key_arn : aws_kms_key.db[0].arn
}

output "db_security_group_id" {
  description = "Security group ID for the database"
  value       = aws_security_group.db.id
}