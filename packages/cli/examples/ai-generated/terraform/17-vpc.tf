# Prompt: "set up a VPC with a couple of subnets for my app"
# AI typically omits flow logs and leaves subnets auto-assigning public IPs.

# No aws_flow_log references this VPC -> flagged (warn) for missing flow logs.
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  tags = {
    team        = "platform"
    cost_center = "cc-1"
    environment = "production"
  }
}

# This VPC has a flow log wired up (references it via vpc_id) -> passes.
resource "aws_vpc" "logged" {
  cidr_block = "10.1.0.0/16"
}

resource "aws_flow_log" "logged" {
  vpc_id          = aws_vpc.logged.id
  traffic_type    = "ALL"
  log_destination = "arn:aws:s3:::flow-logs-bucket"
}

# Public subnet: auto-assigns public IPs (block) and IPv6 (warn).
resource "aws_subnet" "public" {
  vpc_id                          = aws_vpc.main.id
  cidr_block                      = "10.0.1.0/24"
  map_public_ip_on_launch         = true
  assign_ipv6_address_on_creation = true
}

# Private subnet: no auto-assignment -> passes.
resource "aws_subnet" "private" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.2.0/24"
  map_public_ip_on_launch = false
}
