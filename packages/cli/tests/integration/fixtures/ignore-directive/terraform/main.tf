# VIOLATION without an ignore — SSH open to the internet. Must be flagged.
resource "aws_security_group" "flagged" {
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# pluvian:ignore: bastion host — SSH is intentionally public behind a CIDR allowlist
resource "aws_security_group" "ignored" {
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Same violation, suppressed via a TRAILING comment on the block line.
resource "aws_security_group" "trailing" { # pluvian:ignore
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}