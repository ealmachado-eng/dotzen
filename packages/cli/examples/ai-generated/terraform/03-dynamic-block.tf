# Prompt variant: "use a dynamic block for the ingress rules"
# AI tools produce this when asked to parameterize. SSH (22) is open to
# 0.0.0.0/0 via a dynamic block. Stresses whether the matcher expands
# `dynamic "ingress"` into ingress rules.
locals {
  rules = [
    { port = 22, cidr = "0.0.0.0/0" },
    { port = 443, cidr = "0.0.0.0/0" },
  ]
}

resource "aws_security_group" "dynamic_sg" {
  name = "dynamic-sg"

  dynamic "ingress" {
    for_each = local.rules
    content {
      from_port   = ingress.value.port
      to_port     = ingress.value.port
      protocol    = "tcp"
      cidr_blocks = [ingress.value.cidr]
    }
  }
}
