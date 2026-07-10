# Development environment — one compliant instantiation. Prod-only rules
# (deletion protection, 30-day retention) must NOT apply here.
module "rds" {
  source = "../../modules/rds"

  ou          = "cloud"
  environment = "development"

  allowed_cidr_blocks     = ["10.0.0.0/8"]
  deletion_protection     = false
  backup_retention_period = 7

  tags = {
    apm_id      = "APM1234567"
    cmdb_app_id = "APM7654321"
    Application = "payments"
  }
}
