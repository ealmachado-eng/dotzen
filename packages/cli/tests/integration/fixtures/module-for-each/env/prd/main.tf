# Environment layer: one module call expanded over a for_each map. The "good"
# key threads a restricted cidr (10/8); the "bad" key threads 0.0.0.0/0. Two
# SG instances result, distinguishable in the trace by their for_each key.

module "db" {
  source   = "../../modules/rds"
  for_each = {
    good = "10.0.0.0/8"
    bad  = "0.0.0.0/0"
  }
  cidr = each.value
}