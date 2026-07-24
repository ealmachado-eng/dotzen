# ── VIOLATIONS (CIS Azure preset must flag these) ───────────────────────

# Storage: no TLS floor, public nested items, public network, default Allow
resource "azurerm_storage_account" "bad_storage" {
  name                     = "badstorageacct1"
  resource_group_name      = "rg"
  location                 = "eastus"
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_0"
  allow_nested_items_to_be_public = true
  public_network_access_enabled   = true
}

# MSSQL: no TLS floor
resource "azurerm_mssql_server" "bad_sql" {
  name                         = "bad-sql"
  resource_group_name          = "rg"
  location                     = "eastus"
  version                      = "12.0"
  administrator_login          = "admin"
  administrator_login_password = "hunter2"
  minimum_tls_version          = "1.0"
}

# PostgreSQL: no SSL enforcement
resource "azurerm_postgresql_server" "bad_pg" {
  name                = "bad-pg"
  resource_group_name = "rg"
  location            = "eastus"
  version             = "11"
  ssl_enforcement_enabled = false
}

# Key Vault: no purge protection
resource "azurerm_key_vault" "bad_kv" {
  name                       = "bad-kv"
  resource_group_name        = "rg"
  location                   = "eastus"
  tenant_id                  = "00000000-0000-0000-0000-000000000000"
  sku_name                   = "standard"
  purge_protection_enabled   = false
}

# AKS: no private cluster, local accounts enabled
resource "azurerm_kubernetes_cluster" "bad_aks" {
  name                = "bad-aks"
  location            = "eastus"
  resource_group_name = "rg"
  dns_prefix          = "bad"
  private_cluster_enabled = false
  local_account_disabled  = false

  default_node_pool {
    name       = "default"
    node_count = 1
    vm_size    = "Standard_DS2_v2"
  }

  identity {
    type = "SystemAssigned"
  }
}

# App Service: not HTTPS-only
resource "azurerm_linux_web_app" "bad_web" {
  name                = "bad-web"
  resource_group_name = "rg"
  location            = "eastus"
  service_plan_id     = "plan"
  https_only          = false
}

# Container Registry: admin enabled
resource "azurerm_container_registry" "bad_acr" {
  name                = "badacr"
  resource_group_name = "rg"
  location            = "eastus"
  sku                 = "Standard"
  admin_enabled       = true
}

# ── COMPLIANT (preset must NOT flag these) ──────────────────────────────

resource "azurerm_storage_account" "good_storage" {
  name                     = "goodstorageacct"
  resource_group_name      = "rg"
  location                 = "eastus"
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"
  allow_nested_items_to_be_public = false
  public_network_access_enabled   = false

  network_rules {
    default_action = "Deny"
  }
}

resource "azurerm_mssql_server" "good_sql" {
  name                         = "good-sql"
  resource_group_name          = "rg"
  location                     = "eastus"
  version                      = "12.0"
  administrator_login          = "admin"
  administrator_login_password = var.sql_password
  minimum_tls_version          = "1.2"
}

resource "azurerm_key_vault" "good_kv" {
  name                       = "good-kv"
  resource_group_name        = "rg"
  location                   = "eastus"
  tenant_id                  = "00000000-0000-0000-0000-000000000000"
  sku_name                   = "standard"
  purge_protection_enabled   = true
}

# ── Additional violations: RBAC + binding-surface ───────────────────────

# RBAC: grants Owner (CIS Azure — least privilege)
resource "azurerm_role_assignment" "bad_owner" {
  scope                = "/subscriptions/00000000-0000-0000-0000-000000000000"
  role_definition_name = "Owner"
  principal_id         = "00000000-0000-0000-0000-000000000000"
}

# A secret-looking variable WITHOUT sensitive = true (binding-surface rule)
variable "sql_password" {
  default = "hunter2"
}

# A local with a hardcoded secret (binding-surface rule)
locals {
  admin_token = "ghp_xxxxxxxxxxxx"
}

# ── Additional compliant: RBAC Reader + sensitive variable ──────────────

resource "azurerm_role_assignment" "good_reader" {
  scope                = "/subscriptions/00000000-0000-0000-0000-000000000000"
  role_definition_name = "Reader"
  principal_id         = "00000000-0000-0000-0000-000000000000"
}

variable "safe_secret" {
  default   = "ref-to-secret"
  sensitive = true
}
