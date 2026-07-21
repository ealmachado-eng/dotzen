# A violating task — DB_PASSWORD is a plaintext literal in environment.
# denyPlaintextEnvSecrets flags this.
resource "aws_ecs_task_definition" "bad" {
  family = "bad"
  container_definitions = jsonencode([
    {
      name      = "app"
      image     = "app:latest"
      essential = true
      environment = [
        { name = "APP_ENV", value = "production" },
        { name = "DB_PASSWORD", value = "hunter2" }
      ]
    }
  ])
}

# A compliant task — DB_PASSWORD is a ${var.db_password} reference.
# denyPlaintextEnvSecrets passes (the value is a reference, not a literal).
resource "aws_ecs_task_definition" "good" {
  family = "good"
  container_definitions = jsonencode([
    {
      name      = "app"
      image     = "app:latest"
      essential = true
      environment = [
        { name = "APP_ENV", value = "production" },
        { name = "DB_PASSWORD", value = "${var.db_password}" }
      ]
    }
  ])
}

variable "db_password" {
  type      = string
  sensitive = true
}
