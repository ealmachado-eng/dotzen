# Outer module: receives the caller's allowed_cidrs as var.allowed_cidrs,
# then calls the inner module passing that list on as var.cidrs.

variable "allowed_cidrs" { type = list(string) }

module "inner_db" {
  source = "../inner"
  cidrs  = var.allowed_cidrs
}