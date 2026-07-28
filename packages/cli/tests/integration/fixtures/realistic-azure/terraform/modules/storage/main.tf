variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "resource_group_name" {
  description = "Resource group name"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
}

resource "azurerm_storage_account" "module_storage" {
  name                            = "modulestorageacct"
  resource_group_name             = var.resource_group_name
  location                        = var.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  https_only                      = true

  tags = {
    team        = "platform"
    cost_center = "cc-1001"
    environment = var.environment
  }
}
