# Prompt: "Terraform for a Postgres RDS instance for my app"
# Typical AI output omits encryption and leaves it publicly reachable.
resource "aws_db_instance" "app_db" {
  identifier          = "app-db"
  engine              = "postgres"
  instance_class      = "db.t3.medium"
  allocated_storage   = 20
  username            = "admin"
  publicly_accessible = true
  backup_retention_period = 3 # below the 7-day minimum
  # storage_encrypted not set -> defaults to false (unencrypted)
}

# A compliant instance for contrast.
resource "aws_db_instance" "reports_db" {
  identifier          = "reports-db"
  engine              = "postgres"
  instance_class      = "db.t3.medium"
  allocated_storage   = 20
  storage_encrypted   = true
  publicly_accessible = false
  backup_retention_period = 14 # compliant

  tags = {
    team        = "data"
    cost_center = "cc-42"
    environment = "production"
  }
}
