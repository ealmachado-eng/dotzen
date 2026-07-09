# Prompt variant: "security group allowing SSH only from the corporate VPN"
# Compliant — SSH restricted to a private range. Should PASS (no violation).
resource "aws_security_group" "internal" {
  name = "internal-sg"

  ingress {
    description = "SSH from VPN"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]
  }

  ingress {
    description = "HTTPS public"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
