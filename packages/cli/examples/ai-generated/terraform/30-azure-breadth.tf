# Prompt: "a managed disk and a Key Vault with logging for my app"
# CIS L1 breadth: CMK on disks, network default-deny, diagnostic logging.
resource "azurerm_managed_disk" "bad" {
  name                 = "app-disk"
  resource_group_name  = "app-rg"
  location             = "eastus"
  storage_account_type = "Premium_LRS"
  create_option        = "Empty"
  disk_size_gb         = 64
  # no disk_encryption_set_id -> warn (platform-managed key only)
}

resource "azurerm_managed_disk" "good" {
  name                   = "app-disk-2"
  resource_group_name    = "app-rg"
  location               = "eastus"
  storage_account_type   = "Premium_LRS"
  create_option          = "Empty"
  disk_size_gb           = 64
  disk_encryption_set_id = "/subscriptions/x/diskEncryptionSets/app"
}

# A Key Vault that satisfies every Key Vault rule (purge protection,
# network default-deny, tags) and has a diagnostic setting -> passes.
resource "azurerm_key_vault" "logged" {
  name                     = "app-kv-logged"
  resource_group_name      = "app-rg"
  location                 = "eastus"
  tenant_id                = "00000000-0000-0000-0000-000000000000"
  sku_name                 = "standard"
  purge_protection_enabled = true

  network_acls {
    default_action = "Deny"
    bypass         = "AzureServices"
  }

  tags = {
    team        = "platform"
    cost_center = "cc-1"
    environment = "production"
  }
}

resource "azurerm_monitor_diagnostic_setting" "kv" {
  name                       = "kv-diag"
  target_resource_id         = azurerm_key_vault.logged.id
  log_analytics_workspace_id = "/subscriptions/x/workspaces/app"
}
