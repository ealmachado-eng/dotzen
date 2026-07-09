# Prompt: "an EC2 instance, a DynamoDB table, and an ECR repo for my app"
# Typical AI output leaves IMDSv2, SSE, and image scanning at insecure defaults.
resource "aws_instance" "app" {
  ami                         = "ami-0abcdef"
  instance_type               = "t3.micro"
  associate_public_ip_address = true # public IP on the instance

  root_block_device {
    volume_size = 20
    encrypted   = false # unencrypted root volume
  }
  # no metadata_options -> IMDSv1 allowed (http_tokens defaults to "optional")
}

resource "aws_dynamodb_table" "sessions" {
  name         = "sessions"
  hash_key     = "id"
  billing_mode = "PAY_PER_REQUEST"

  server_side_encryption {
    enabled = false
  }
}

resource "aws_ecr_repository" "app" {
  name = "app"

  image_scanning_configuration {
    scan_on_push = false
  }
}
