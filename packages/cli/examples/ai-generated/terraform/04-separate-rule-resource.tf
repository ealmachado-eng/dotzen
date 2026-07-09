# Prompt variant: "use the modern separate ingress rule resource"
# Newer AWS provider style: aws_vpc_security_group_ingress_rule instead
# of an inline ingress block. SSH open to the internet. This is a
# DIFFERENT resource type and shape from inline ingress.
resource "aws_security_group" "modern" {
  name = "modern-sg"
}

resource "aws_vpc_security_group_ingress_rule" "ssh" {
  security_group_id = aws_security_group.modern.id
  from_port         = 22
  to_port           = 22
  ip_protocol       = "tcp"
  cidr_ipv4         = "0.0.0.0/0"
}
