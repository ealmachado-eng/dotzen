# Prompt: "Terraform for an EC2 security group allowing SSH and web access"
# Typical literal output — the classic case pluvian targets.
resource "aws_security_group" "app" {
  name        = "app-sg"
  description = "Allow SSH and HTTP inbound traffic"
  vpc_id      = "vpc-12345678"

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
