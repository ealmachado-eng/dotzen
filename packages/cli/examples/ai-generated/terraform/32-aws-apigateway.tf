# Prompt: "an API Gateway REST API for my app"
# AI commonly leaves methods unauthenticated and stages without logging.
resource "aws_api_gateway_rest_api" "app" {
  name = "app-api"
}

resource "aws_api_gateway_resource" "app" {
  rest_api_id = aws_api_gateway_rest_api.app.id
  parent_id   = aws_api_gateway_rest_api.app.root_resource_id
  path_part   = "items"
}

# Unauthenticated method -> violation (warn).
resource "aws_api_gateway_method" "public" {
  rest_api_id   = aws_api_gateway_rest_api.app.id
  resource_id   = aws_api_gateway_resource.app.id
  http_method   = "GET"
  authorization = "NONE"
}

# IAM-authorized method -> passes.
resource "aws_api_gateway_method" "secured" {
  rest_api_id   = aws_api_gateway_rest_api.app.id
  resource_id   = aws_api_gateway_resource.app.id
  http_method   = "POST"
  authorization = "AWS_IAM"
}

# Stage with no access logging and X-Ray off -> two warnings.
resource "aws_api_gateway_stage" "bad" {
  rest_api_id   = aws_api_gateway_rest_api.app.id
  deployment_id = "dep-1"
  stage_name    = "prod"
  # access_log_settings absent -> warn; xray_tracing_enabled default false -> warn
}

# Stage with access logging + tracing -> passes.
resource "aws_api_gateway_stage" "good" {
  rest_api_id          = aws_api_gateway_rest_api.app.id
  deployment_id        = "dep-1"
  stage_name           = "prod2"
  xray_tracing_enabled = true

  access_log_settings {
    destination_arn = "arn:aws:logs:us-east-1:123456789012:log-group:api"
    format          = "$context.requestId"
  }
}
