# Environment layer: only module calls, no direct resources. Without
# module-following, pluvian would report "0 checks" here. The concrete
# governance values (cidrs, tags) live in these inputs.

module "db_good" {
  source        = "../../modules/rds"
  allowed_cidrs = ["10.0.0.0/8"]
  tags          = { apm_id = "a", cmdb_app_id = "b" }
}

module "db_bad" {
  source        = "../../modules/rds"
  allowed_cidrs = ["0.0.0.0/0"]        # Postgres open to the internet
  tags          = { apm_id = "a" }     # missing cmdb_app_id
}
