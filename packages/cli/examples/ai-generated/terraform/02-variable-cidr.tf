# Prompt variant: "make the SSH CIDR configurable"
# Uses a variable — a resolved value would be needed to judge; static
# analysis should say "could not evaluate", never a silent pass.
variable "admin_cidr" {
  type    = string
  default = "0.0.0.0/0"
}

resource "aws_security_group" "bastion" {
  name = "bastion-sg"

  ingress {
    description = "SSH from admin"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }
}
