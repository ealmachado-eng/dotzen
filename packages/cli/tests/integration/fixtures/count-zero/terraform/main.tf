# A disabled security group: count = 0 means no instance is created, so
# dotzen must SKIP it silently (no false violation on the SSH ingress it
# would otherwise flag). This is the resource-level analog of module
# count = 0 handling in followModules.
resource "aws_security_group" "disabled" {
  count = 0
  name  = "disabled-sg"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# An active security group with the same open-SSH ingress — this one IS
# evaluated and must be flagged, proving count = 0 skipping is not a
# blanket suppression.
resource "aws_security_group" "active" {
  name = "active-sg"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
