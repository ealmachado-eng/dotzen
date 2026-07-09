# Prompt: "security group that lets my app reach the database"
# AI often writes a wide-open egress rather than a scoped one.
resource "aws_security_group" "app_egress" {
  name = "app-egress-sg"

  egress {
    description = "Postgres"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    team        = "app"
    cost_center = "cc-3"
    environment = "production"
  }
}
