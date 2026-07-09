# Prompt: "an IAM policy so my app can do what it needs"
# The #1 dangerous AI-generated pattern: a wildcard admin policy.

# Heredoc JSON — statically parseable, so dotzen flags the wildcard.
resource "aws_iam_policy" "admin" {
  name = "app-admin"

  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "*", "Resource": "*" }
  ]
}
POLICY
}

# A least-privilege policy — passes.
resource "aws_iam_role_policy" "scoped" {
  name = "app-read"
  role = "app-role"

  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:GetObject"], "Resource": "arn:aws:s3:::my-bucket/*" }
  ]
}
POLICY
}

# NotAction on an Allow: "allow everything EXCEPT iam:*" — an over-broad
# grant AWS warns against. dotzen flags it too.
resource "aws_iam_policy" "not_action" {
  name = "app-almost-admin"

  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "NotAction": "iam:*", "Resource": "*" }
  ]
}
POLICY
}

# jsonencode(...) is not statically readable -> "could not evaluate"
# (honest: dotzen won't guess). Same wildcard, but reported differently.
resource "aws_iam_policy" "encoded_admin" {
  name = "app-admin-2"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "*", Resource = "*" }]
  })
}
