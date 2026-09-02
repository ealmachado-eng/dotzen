# Environment layer with a mix of local and remote module calls. The local
# call is followed and produces a concrete verdict; the remote call cannot be
# fetched, so doc 08's DoD requires pluvian to surface it (not silently pass).

module "local" {
  source = "../../modules/rds"
}

module "remote" {
  source        = "git::https://example.com/rds.git"
  allowed_cidrs = ["0.0.0.0/0"]
}