# Prompt: "an Azure SQL server for my app"
# AI pastes a literal admin password and leaves weak TLS / public access.
variable "sql_password" {
  type      = string
  sensitive = true
}

resource "azurerm_mssql_server" "bad" {
  name                          = "appsql"
  resource_group_name           = "app-rg"
  location                      = "eastus"
  version                       = "12.0"
  administrator_login           = "sqladmin"
  administrator_login_password  = "P@ssw0rd123!" # hardcoded -> violation
  minimum_tls_version           = "1.0"          # weak TLS -> violation
  public_network_access_enabled = true           # -> warn
  tags = {
    team        = "data"
    cost_center = "cc-2"
    environment = "production"
  }
}

resource "azurerm_mssql_server" "good" {
  name                         = "appsql2"
  resource_group_name          = "app-rg"
  location                     = "eastus"
  version                      = "12.0"
  administrator_login          = "sqladmin"
  administrator_login_password = var.sql_password # reference -> passes
  minimum_tls_version          = "1.2"
  tags = {
    team        = "data"
    cost_center = "cc-2"
    environment = "production"
  }
}
