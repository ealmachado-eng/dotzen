# Environment layer: two calls of the same outer module — a "good" instance
# (cidr restricted to 10/8) and a "bad" one (Postgres open to 0.0.0.0/0).
# Each outer call threads its cidrs into an inner module. The inner module
# holds the actual SG; the cidr has to thread two hops (doc 08 tranche 5).

module "db_good" {
  source        = "../../modules/outer"
  allowed_cidrs = ["10.0.0.0/8"]
}

module "db_bad" {
  source        = "../../modules/outer"
  allowed_cidrs = ["0.0.0.0/0"]
}