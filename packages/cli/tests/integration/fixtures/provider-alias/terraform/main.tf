# The DR-region provider configuration (alias "dr"). Resources with
# `provider = aws.dr` are pinned to this account/region.
provider "aws" {
  alias  = "dr"
  region = "us-west-2"
}

# VIOLATION: pinned to the dr provider (alias) AND the root volume is
# unencrypted — the dr-scoped rule fires.
resource "aws_instance" "dr_unencrypted" {
  ami           = "ami-1"
  instance_type = "t3.micro"
  provider      = aws.dr

  root_block_device {
    encrypted = false
  }
}

# PASS: dr provider but the root volume IS encrypted.
resource "aws_instance" "dr_encrypted" {
  ami           = "ami-2"
  instance_type = "t3.micro"
  provider      = aws.dr

  root_block_device {
    encrypted = true
  }
}

# SKIPPED: default provider (no provider arg). Even though the root volume is
# unencrypted, the dr-scoped rule does not apply — no violation.
resource "aws_instance" "default_unencrypted" {
  ami           = "ami-3"
  instance_type = "t3.micro"

  root_block_device {
    encrypted = false
  }
}