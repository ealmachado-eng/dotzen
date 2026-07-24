# Module layer: real resources, but values come from the caller's vars.
# On its own these are "could not evaluate"; module-following threads the
# env's inputs into var.* so they become concrete verdicts.

variable "allowed_cidrs" {
  type = list(string)
}

variable "tags" {
  type = map(string)
}

resource "aws_db_instance" "this" {
  engine           = "postgres"
  instance_class   = "db.t3.micro"
  allocated_storage = 20
  tags             = var.tags
}

resource "aws_security_group" "this" {
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidrs
  }
}
