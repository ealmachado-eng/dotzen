# Prompt: "an Azure Key Vault and an AKS cluster for my app"
# AI skips purge protection on the vault and leaves the AKS API public.
resource "azurerm_key_vault" "app" {
  name                = "app-kv"
  resource_group_name = "app-rg"
  location            = "eastus"
  tenant_id           = "00000000-0000-0000-0000-000000000000"
  sku_name            = "standard"
  # purge_protection_enabled defaults to false -> violation
  tags = {
    team        = "platform"
    cost_center = "cc-1"
    environment = "production"
  }
}

resource "azurerm_kubernetes_cluster" "app" {
  name                = "app-aks"
  resource_group_name = "app-rg"
  location            = "eastus"
  dns_prefix          = "app"
  # private_cluster_enabled defaults to false -> warn

  default_node_pool {
    name       = "default"
    node_count = 2
    vm_size    = "Standard_D2_v2"
  }

  identity {
    type = "SystemAssigned"
  }
}
