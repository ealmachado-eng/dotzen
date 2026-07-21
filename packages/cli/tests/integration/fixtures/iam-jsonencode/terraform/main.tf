# IAM policy via jsonencode(...) with a full-admin wildcard statement.
# Before v0.1.3 this degraded to "could not evaluate" (jsonencode was not
# statically parsed); now the HCL object literal is parsed and the wildcard
# is flagged as a violation.
resource "aws_iam_policy" "encoded_admin" {
  name = "app-admin-2"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "*", Resource = "*" }]
  })
}

# ECS task definition via jsonencode(...) with a privileged container.
# Before v0.1.3 this degraded to "could not evaluate"; now the HCL array
# literal is parsed and the privileged container is flagged.
resource "aws_ecs_task_definition" "encoded" {
  family = "encoded"
  container_definitions = jsonencode([
    { name = "app", image = "app:latest", privileged = true }
  ])
}

# A compliant IAM policy (scoped, no wildcard) — must PASS.
resource "aws_iam_policy" "scoped" {
  name = "scoped-read"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "s3:GetObject", Resource = "arn:aws:s3:::example/*" }]
  })
}

# A compliant ECS task (no privileged container) — must PASS.
resource "aws_ecs_task_definition" "safe" {
  family = "safe"
  container_definitions = jsonencode([
    { name = "app", image = "app:latest", privileged = false }
  ])
}
