# No environment tag either — but ./prod is mapped to production, so the
# production-only encryption rule DOES apply here and fires.
resource "aws_db_instance" "app" {
  identifier        = "prod-app"
  storage_encrypted = false
}
