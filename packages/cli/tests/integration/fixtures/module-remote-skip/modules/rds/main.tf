# Static module (no caller-supplied vars): a compliant DB instance.

resource "aws_db_instance" "this" {
  storage_encrypted = true
  tags = { apm_id = "a" }
}