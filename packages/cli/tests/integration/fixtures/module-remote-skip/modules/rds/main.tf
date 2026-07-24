# Static module (no caller-supplied vars): a compliant DB instance.

resource "aws_db_instance" "this" {
  engine           = "postgres"
  instance_class   = "db.t3.micro"
  allocated_storage = 20
  storage_encrypted = true
  tags = { apm_id = "a" }
}