# ── AWS Lambda ──────────────────────────────────────────────────────────
# `bad`: no tracing, no KMS key, a plaintext DB_PASSWORD, and no tags.
resource "aws_lambda_function" "bad" {
  function_name = "bad"
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  role          = "arn:aws:iam::1:role/lambda-bad"

  environment {
    variables = {
      APP_ENV     = "production"
      DB_PASSWORD = "hunter2"
    }
  }
}

# `good`: Active tracing, a customer KMS key, a referenced secret, tagged.
resource "aws_lambda_function" "good" {
  function_name = "good"
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  role          = "arn:aws:iam::1:role/lambda-good"
  kms_key_arn   = "arn:aws:kms:us-east-1:1/key/abc"

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      APP_ENV     = "production"
      DB_PASSWORD = "${var.db_password}"
    }
  }

  tags = {
    team             = "platform"
    cost_center      = "cc-1"
    environment      = "production"
  }
}

variable "db_password" {
  type      = string
  sensitive = true
}

# ── Azure Functions (azurerm_linux_function_app) ────────────────────────
# `bad`: plaintext HTTP, TLS 1.0, public network, no identity, plaintext
# API_KEY, no diagnostic setting, untagged.
resource "azurerm_linux_function_app" "bad" {
  name                          = "bad"
  resource_group_name           = "rg"
  service_plan_id               = "plan"
  https_only                    = false
  public_network_access_enabled = true

  site_config {
    minimum_tls_version = "1.0"
  }

  app_settings = {
    APP_ENV = "production"
    API_KEY = "sk-1234"
  }
}

# `good`: HTTPS-only, TLS 1.2, no public network, a SystemAssigned identity,
# a referenced secret, tagged, and linked to a diagnostic setting.
resource "azurerm_linux_function_app" "good" {
  name                          = "good"
  resource_group_name           = "rg"
  service_plan_id               = "plan"
  https_only                    = true
  public_network_access_enabled = false

  site_config {
    minimum_tls_version = "1.2"
  }

  identity {
    type = "SystemAssigned"
  }

  app_settings = {
    APP_ENV = "production"
    API_KEY = "${var.api_key}"
  }

  tags = {
    team        = "platform"
    cost_center = "cc-1"
    environment = "production"
  }
}

resource "azurerm_monitor_diagnostic_setting" "good_fn" {
  name               = "diag-good"
  target_resource_id = azurerm_linux_function_app.good.id
}

variable "api_key" {
  type      = string
  sensitive = true
}

# ── GCP Cloud Run Functions (google_cloudfunctions2_function) ───────────
# `bad`: ALLOW_ALL ingress, no service account, a plaintext DB_PASSWORD,
# untagged.
resource "google_cloudfunctions2_function" "bad" {
  name     = "bad"
  location = "us-central1"

  service_config {
    ingress_settings = "ALLOW_ALL"
    environment_variables = {
      APP_ENV     = "production"
      DB_PASSWORD = "hunter2"
    }
  }
}

# `good`: restricted ingress, a dedicated service account, a referenced
# secret, tagged.
resource "google_cloudfunctions2_function" "good" {
  name     = "good"
  location = "us-central1"

  service_config {
    ingress_settings       = "ALLOW_INTERNAL_AND_GCLB"
    service_account_email  = "fn@good-proj.iam.gserviceaccount.com"
    environment_variables = {
      APP_ENV     = "production"
      DB_PASSWORD = "${var.gcp_db_password}"
    }
  }

  labels = {
    team        = "platform"
    cost_center = "cc-1"
    environment = "production"
  }
}

variable "gcp_db_password" {
  type      = string
  sensitive = true
}
