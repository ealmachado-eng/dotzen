# A DB instance exposing a secret attribute (master_password).
resource "aws_db_instance" "prod" {
  identifier        = "prod"
  engine            = "postgres"
  instance_class    = "db.t3.micro"
  master_password   = "should-be-a-ref"
  allocated_storage = 20
}

# VIOLATION: the output references the secret master_password but does NOT set
# sensitive = true → leaks in state / CI logs. denyInsensitiveSecretOutput
# must flag output.db_password.
output "db_password" {
  value = aws_db_instance.prod.master_password
}

# PASS: the same secret reference, but sensitive = true → protected.
output "db_password_safe" {
  value     = aws_db_instance.prod.master_password
  sensitive = true
}

# PASS: a non-secret attribute — no leak regardless of sensitive.
output "db_endpoint" {
  value = aws_db_instance.prod.endpoint
}