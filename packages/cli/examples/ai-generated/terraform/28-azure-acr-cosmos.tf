# Prompt: "an Azure Container Registry and a Cosmos DB for my app"
# AI enables the ACR admin user and leaves Cosmos public.
resource "azurerm_container_registry" "bad" {
  name                = "appacr"
  resource_group_name = "app-rg"
  location            = "eastus"
  sku                 = "Standard"
  admin_enabled       = true # shared admin credential -> violation
}

resource "azurerm_container_registry" "good" {
  name                = "appacr2"
  resource_group_name = "app-rg"
  location            = "eastus"
  sku                 = "Standard"
  admin_enabled       = false
}

resource "azurerm_cosmosdb_account" "bad" {
  name                          = "appcosmos"
  resource_group_name           = "app-rg"
  location                      = "eastus"
  offer_type                    = "Standard"
  public_network_access_enabled = true # -> warn

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = "eastus"
    failover_priority = 0
  }
}
