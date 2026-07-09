# Prompt: "an Azure web app plus a Postgres/MySQL server for my app"
# AI leaves HTTPS-only off and SSL enforcement unset, with public access on.
resource "azurerm_linux_web_app" "bad" {
  name                = "app"
  resource_group_name = "app-rg"
  location            = "eastus"
  service_plan_id     = "/subscriptions/x/plan"
  # https_only defaults to false -> violation
  site_config {}
}

resource "azurerm_linux_web_app" "good" {
  name                = "app2"
  resource_group_name = "app-rg"
  location            = "eastus"
  service_plan_id     = "/subscriptions/x/plan"
  https_only          = true
  site_config {}
}

resource "azurerm_postgresql_server" "bad" {
  name                = "pg"
  resource_group_name = "app-rg"
  location            = "eastus"
  sku_name                      = "GP_Gen5_2"
  version                       = "11"
  ssl_enforcement_enabled       = false # SSL not enforced -> violation
  public_network_access_enabled = true  # -> warn
}

resource "azurerm_mysql_server" "good" {
  name                          = "mysql"
  resource_group_name           = "app-rg"
  location                      = "eastus"
  sku_name                      = "GP_Gen5_2"
  version                       = "8.0"
  ssl_enforcement_enabled       = true
  public_network_access_enabled = false
}
