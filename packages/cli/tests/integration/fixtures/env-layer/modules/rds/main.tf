# Module layer: security posture is HARDCODED, but governance values (cidrs,
# tags, retention, deletion protection) come from the CALLER via var.*. Tags
# use the real-world merge(var.tags, { ... }) pattern — the case that only
# resolves fully once module-following threads a concrete var.tags in.

variable "allowed_cidr_blocks" { type = list(string) }
variable "tags" { type = map(string) }
variable "ou" { type = string }
variable "environment" { type = string }
variable "deletion_protection" {
  type    = bool
  default = false
}
variable "backup_retention_period" {
  type    = number
  default = 1
}

locals {
  # Caller's tags plus the two the module stamps itself. Refs in the VALUES
  # (var.ou / var.environment) must NOT be mistaken for map arguments.
  common_tags = merge(var.tags, {
    Ou          = var.ou
    Environment = var.environment
  })
}

resource "aws_db_instance" "this" {
  identifier              = "app-db"
  engine                  = "postgres"
  instance_class          = "db.t3.micro"
  allocated_storage       = 20
  storage_encrypted       = true
  publicly_accessible     = false
  deletion_protection     = var.deletion_protection
  backup_retention_period = var.backup_retention_period
  tags                    = local.common_tags
}

resource "aws_security_group" "this" {
  name = "app-db-sg"

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }

  tags = local.common_tags
}
