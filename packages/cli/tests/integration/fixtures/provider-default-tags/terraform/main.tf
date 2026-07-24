# The root provider declares default_tags inherited by EVERY aws resource
# (including those reached through followed modules). Both apm_id and
# cmdb_app_id are supplied here, so the tagless DB instances satisfy the
# mustHaveTags rule via the provider rather than their own tags block.
provider "aws" {
  default_tags {
    tags = {
      apm_id      = "apm1"
      cmdb_app_id = "cmdb1"
    }
  }
}

# Tagless on purpose: both required tags come from the provider. The
# mustHaveTags rule must PASS on this resource (the fix).
resource "aws_db_instance" "via_provider" {
  identifier     = "via-provider"
  engine         = "postgres"
  instance_class = "db.t3.micro"
}

# Control: a security group with SSH open to the internet — the denyIngress
# rule must still fire on this one (not suppressed by the provider fix).
resource "aws_security_group" "violator" {
  name = "violator-sg"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# A followed module with NO provider block of its own — it inherits the
# root's default_tags (Terraform provider inheritance). Its tagless DB
# instance must also PASS the mustHaveTags rule.
module "mod" {
  source = "./modules/db"
}
