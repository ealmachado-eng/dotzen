# A topology fixture for the v2 graph layer (denyIfReachable).
#
# A DB in a PUBLIC subnet (violates — chain reaches an IGW).
# A DB in a PRIVATE subnet (passes — no route to any gateway).
#
# NOTE: vpc_id references are intentionally omitted. In the v1 untyped graph,
# vpc_id is a structural edge that over-connects every VPC resource through
# the VPC node (subnet → vpc ← igw), creating false positives. Edge types
# (Phase 6, doc 10) will filter structural vs routing edges. This fixture
# tests the routing-chain traversal in isolation — the real-world behavior
# improves when edge types land.

resource "aws_db_instance" "public_db" {
  engine         = "postgres"
  instance_class = "db.t3.micro"
  subnet_id      = aws_subnet.public.id
}

resource "aws_subnet" "public" {
  cidr_block = "10.0.1.0/24"
}

resource "aws_route_table_association" "public_rta" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public_rt.id
}

resource "aws_route_table" "public_rt" {}

resource "aws_route" "public_igw" {
  route_table_id         = aws_route_table.public_rt.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.igw.id
}

resource "aws_internet_gateway" "igw" {}

resource "aws_db_instance" "private_db" {
  engine         = "postgres"
  instance_class = "db.t3.micro"
  subnet_id      = aws_subnet.private.id
}

resource "aws_subnet" "private" {
  cidr_block = "10.0.2.0/24"
}

resource "aws_route_table_association" "private_rta" {
  subnet_id      = aws_subnet.private.id
  route_table_id = aws_route_table.private_rt.id
}

resource "aws_route_table" "private_rt" {}
