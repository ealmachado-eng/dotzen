# The DR-region provider (alias "dr"). The module call below remaps its
# default aws provider to this alias.
provider "aws" {
  alias  = "dr"
  region = "us-west-2"
}

# The module call passes `providers = { aws = aws.dr }` — the child's default
# aws provider runs under the dr alias. The child resource has NO explicit
# `provider` arg, so pluvian remaps it to alias "dr" (#13).
module "m" {
  source   = "./modules/mod"
  providers = {
    aws = aws.dr
  }
}