# VIOLATION: no `owners` declared — Terraform returns ANY AMI matching the
# filter, including third-party ones. listMustInclude(owners, "self") flags it.
data "aws_ami" "wildcard" {
  most_recent = true
  filter {
    name   = "name"
    values = ["amzn2-*"]
  }
}

# PASS: owners pinned to the org account + amazon.
data "aws_ami" "pinned" {
  most_recent = true
  owners      = ["self", "amazon"]
  filter {
    name   = "name"
    values = ["amzn2-*"]
  }
}

# VIOLATION: owners present but omit "self" — could still be a third-party.
data "aws_ami" "third_party" {
  owners = ["amazon"]
  filter {
    name   = "name"
    values = ["amzn2-*"]
  }
}