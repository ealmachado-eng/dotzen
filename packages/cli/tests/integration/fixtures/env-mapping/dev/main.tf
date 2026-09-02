# No environment tag — the environment comes from the root mapping in
# pluvian.json (./dev -> development), so the production-only rule skips this.
resource "aws_db_instance" "app" {
  identifier        = "dev-app"
  engine            = "postgres"
  instance_class    = "db.t3.micro"
  allocated_storage = 20
  storage_encrypted = false
}
