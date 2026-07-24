# PASS: registry module pinned with `~>`.
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"
  cidr    = "10.0.0.0/16"
}

# VIOLATION: registry module with a floating bare version.
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "5.0"
}

# VIOLATION: registry module with no version at all.
module "acm" {
  source = "terraform-aws-modules/acm/aws"
}

# PASS: a local module (./ source) — no version, never flagged.
module "local_db" {
  source = "./modules/db"
}