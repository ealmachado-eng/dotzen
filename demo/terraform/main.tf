# A VPC with a public and a private subnet.
#
# The plumbing (VPC, subnets, route tables, gateway) comes first; the
# resources that matter for governance — the route to the Internet and the
# two filesystem mount targets — are at the bottom, where the eye lands.

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" "public" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
}

resource "aws_subnet" "private" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.2.0/24"
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id
}

resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.main.id
}

resource "aws_route_table" "private_rt" {
  vpc_id = aws_vpc.main.id
}

resource "aws_route_table_association" "public_rta" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public_rt.id
}

resource "aws_route_table_association" "private_rta" {
  subnet_id      = aws_subnet.private.id
  route_table_id = aws_route_table.private_rt.id
}

# One shared filesystem, mounted in both subnets:
resource "aws_efs_file_system" "shared" {
  encrypted = true
}

# The public subnet's default route reaches the Internet Gateway:
resource "aws_route" "public_igw" {
  route_table_id         = aws_route_table.public_rt.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.igw.id
}

# One mount target per subnet:
resource "aws_efs_mount_target" "public_mt" {
  file_system_id = aws_efs_file_system.shared.id
  subnet_id      = aws_subnet.public.id   # <- in the public subnet
}

resource "aws_efs_mount_target" "private_mt" {
  file_system_id = aws_efs_file_system.shared.id
  subnet_id      = aws_subnet.private.id   # <- in a private subnet
}
