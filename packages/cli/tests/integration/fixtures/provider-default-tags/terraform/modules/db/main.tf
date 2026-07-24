# No provider block here — this module inherits the root's default_tags
# (threaded through followModules). Tagless on purpose: the mustHaveTags
# rule must PASS via the inherited provider defaults.
resource "aws_db_instance" "inherited" {
  identifier     = "inherited"
  engine         = "postgres"
  instance_class = "db.t3.micro"
}
