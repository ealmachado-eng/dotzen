# Production environment — one compliant call and one an AI assistant might
# plausibly generate: internet-open DB, no deletion protection, short
# retention, and a missing governance tag.

module "rds_good" {
  source = "../../modules/rds"

  ou          = "cloud"
  environment = "production"

  allowed_cidr_blocks     = ["10.0.0.0/8"]
  deletion_protection     = true
  backup_retention_period = 30

  tags = {
    apm_id      = "APM1234567"
    cmdb_app_id = "APM7654321"
    Application = "payments"
  }
}

module "rds_bad" {
  source = "../../modules/rds"

  ou          = "cloud"
  environment = "production"

  allowed_cidr_blocks     = ["0.0.0.0/0"] # Postgres open to the internet
  deletion_protection     = false         # prod requires deletion protection
  backup_retention_period = 7             # prod requires >= 30 days

  tags = {
    apm_id = "APM1234567" # missing cmdb_app_id + Application
  }
}
