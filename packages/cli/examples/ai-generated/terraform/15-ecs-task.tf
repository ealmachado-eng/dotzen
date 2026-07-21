# Prompt: "an ECS task definition for my app with a monitoring sidecar"
# Heredoc JSON is statically parseable, so the privileged sidecar is caught.
resource "aws_ecs_task_definition" "app" {
  family = "app"

  container_definitions = <<DEFS
[
  { "name": "app", "image": "app:latest", "privileged": false },
  { "name": "sidecar", "image": "monitor:latest", "privileged": true }
]
DEFS
}

# jsonencode(...) with a literal HCL array is now parsed (v0.1.3) ->
# the privileged container is flagged.
resource "aws_ecs_task_definition" "encoded" {
  family = "encoded"
  container_definitions = jsonencode([
    { name = "app", image = "app:latest", privileged = true }
  ])
}
