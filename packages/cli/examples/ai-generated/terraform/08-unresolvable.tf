# A genuinely unresolvable case: the SSH CIDR comes from a variable with
# no default, so static analysis cannot know it — pluvian must report
# "could not evaluate", never a silent pass. (Its own CI would pass a
# value at plan time; the pipeline gate still runs the check there too.)
variable "partner_cidr" {
  type = string
  # no default
}

resource "aws_security_group" "partner" {
  name = "partner-sg"

  ingress {
    description = "SSH from partner network"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.partner_cidr]
  }

  tags = {
    team        = "network"
    cost_center = "cc-9"
    environment = "production"
  }
}
