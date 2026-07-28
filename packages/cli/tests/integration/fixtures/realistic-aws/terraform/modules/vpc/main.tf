# Local module: a simple VPC + private subnet. Both aws_vpc and aws_subnet
# are in the AwsResource vocabulary (recognized → governed, no rules apply
# in this spec → passed). The caller threads `environment` in so the
# module's var.* becomes concrete (module-following path).

variable "environment" {
  description = "Deployment environment"
  type        = string
}

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    environment = var.environment
    managed_by  = "terraform"
  }
}

resource "aws_subnet" "private" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "us-east-1a"

  tags = {
    environment = var.environment
    managed_by  = "terraform"
  }
}
