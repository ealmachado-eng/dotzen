# No environment tag — the environment comes from the root mapping in
# dotzen.json (./dev -> development), so the production-only rule skips this.
resource "aws_db_instance" "app" {
  identifier        = "dev-app"
  storage_encrypted = false
}
