# Prompt: "an Azure API Management instance for my app"
# AI sometimes re-enables legacy TLS/SSL and leaves public access on.
resource "azurerm_api_management" "bad" {
  name                = "app-apim"
  resource_group_name = "app-rg"
  location            = "eastus"
  publisher_name      = "App"
  publisher_email     = "ops@example.com"
  sku_name            = "Developer_1"

  public_network_access_enabled = true # -> warn

  security {
    enable_frontend_tls10 = true # legacy TLS -> violation
    enable_backend_ssl30  = true # SSL 3.0 -> violation
  }
}

# Secure defaults (no legacy protocols, private) -> passes.
resource "azurerm_api_management" "good" {
  name                = "app-apim-2"
  resource_group_name = "app-rg"
  location            = "eastus"
  publisher_name      = "App"
  publisher_email     = "ops@example.com"
  sku_name            = "Developer_1"

  public_network_access_enabled = false
}
