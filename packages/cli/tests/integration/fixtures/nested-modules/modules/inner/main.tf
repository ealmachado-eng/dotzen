# Inner module: the actual SG. Its cidr_blocks come from a var the OUTER
# module threads in — two hops of scope-threading from the env caller.

variable "cidrs" { type = list(string) }

resource "aws_security_group" "this" {
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = var.cidrs
  }
}