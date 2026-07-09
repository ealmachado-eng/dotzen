# Prompt: "an Azure storage account for my app"
# AI leaves public blob access on (the insecure default) and no TLS floor,
# and often omits ownership tags.
resource "azurerm_storage_account" "data" {
  name                     = "appdata"
  resource_group_name      = "app-rg"
  location                 = "eastus"
  account_tier             = "Standard"
  account_replication_type = "LRS"
  # allow_nested_items_to_be_public defaults to true -> violation
  # min_tls_version absent -> violation (must be TLS1_2)
  # no tags -> violation
}

resource "azurerm_storage_account" "secure" {
  name                            = "appsecure"
  resource_group_name             = "app-rg"
  location                        = "eastus"
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  allow_nested_items_to_be_public = false
  min_tls_version                 = "TLS1_2"
  public_network_access_enabled   = false
  tags = {
    team        = "web"
    cost_center = "cc-1"
    environment = "production"
  }

  network_rules {
    default_action = "Deny"
    bypass         = ["AzureServices"]
  }
}
