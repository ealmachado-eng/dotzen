# Module: one SG whose cidr_blocks comes from a caller-supplied var. The env
# layer sets that var from each.value (the for_each element), so each key
# expansion gets its own concrete cidr — yielding distinct verdicts per key.

variable "cidr" { type = string }

resource "aws_security_group" "this" {
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.cidr]
  }
}