# Prompt: "store my DB password in Secrets Manager"
# AI frequently pastes the literal secret straight into the config.
variable "db_password" {
  type      = string
  sensitive = true
}

variable "redis_auth_token" {
  type      = string
  sensitive = true
}

resource "aws_secretsmanager_secret" "db" {
  name = "db-password"
}

# Hardcoded literal -> flagged (it would land in state + VCS).
resource "aws_secretsmanager_secret_version" "bad" {
  secret_id     = aws_secretsmanager_secret.db.id
  secret_string = "S3cr3t-password!"
}

# Reference -> passes (the secret comes from a variable, not the code).
resource "aws_secretsmanager_secret_version" "good" {
  secret_id     = aws_secretsmanager_secret.db.id
  secret_string = var.db_password
}

# Aurora cluster with a hardcoded master password -> flagged.
resource "aws_rds_cluster" "main" {
  cluster_identifier = "main"
  engine             = "aurora-postgresql"
  master_username    = "admin"
  master_password    = "SuperSecret123!"
}

# ElastiCache with the auth token pulled from a variable -> passes.
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "redis"
  description          = "app cache"
  auth_token           = var.redis_auth_token
}

# "db" (above) has no rotation resource -> flagged. "api" does -> passes.
resource "aws_secretsmanager_secret" "api" {
  name = "api-key"
}

resource "aws_secretsmanager_secret_rotation" "api" {
  secret_id           = aws_secretsmanager_secret.api.id
  rotation_lambda_arn = "arn:aws:lambda:us-east-1:123456789012:function:rotate"

  rotation_rules {
    automatically_after_days = 30
  }
}
