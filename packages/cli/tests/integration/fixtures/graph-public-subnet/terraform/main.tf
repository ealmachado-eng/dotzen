# A realistic VPC topology exercising the v2 graph layer with edge types.
#
# vpc_id references are present (realistic). The edge-type filter classifies
# vpc_id as 'structural' → excluded from routing queries. So a private DB
# (whose route table has no route to an IGW) does NOT false-positive through
# the VPC node.
#
# Public DB: violates (routing chain reaches IGW).
# Private DB: passes (no routing edge to an IGW; vpc_id is structural/filtered).

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

# ── Public subnet ───────────────────────────────────────────────────────

resource "aws_subnet" "public" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
}

resource "aws_db_instance" "public_db" {
  engine         = "postgres"
  instance_class = "db.t3.micro"
  subnet_id      = aws_subnet.public.id
}

resource "aws_route_table_association" "public_rta" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public_rt.id
}

resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.main.id
}

resource "aws_route" "public_igw" {
  route_table_id         = aws_route_table.public_rt.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.igw.id
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id
}

# ── Private subnet ─────────────────────────────────────────────────────

resource "aws_subnet" "private" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.2.0/24"
}

resource "aws_db_instance" "private_db" {
  engine         = "postgres"
  instance_class = "db.t3.micro"
  subnet_id      = aws_subnet.private.id
}

resource "aws_route_table_association" "private_rta" {
  subnet_id      = aws_subnet.private.id
  route_table_id = aws_route_table.private_rt.id
}

resource "aws_route_table" "private_rt" {
  vpc_id = aws_vpc.main.id
}
