# ── Variables ────────────────────────────────────────────────────────────

variable "environment" {
  description = "Deployment environment (dev, stg, prd)"
  type        = string
  default     = "dev"
}

variable "location" {
  description = "Azure region for all resources"
  type        = string
  default     = "eastus"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "dotzen-demo"
}

variable "sql_admin_password" {
  description = "Administrator password for the SQL server"
  type        = string
  sensitive   = true
}

variable "tags" {
  description = "Additional tags merged into common_tags"
  type        = map(string)
  default     = {}
}

variable "enable_monitoring" {
  description = "Enable diagnostic settings and Log Analytics"
  type        = bool
  default     = true
}

variable "db_sku" {
  description = "SKU for the MSSQL database"
  type        = string
  default     = "B_Gen5_2"
}

variable "storage_replication" {
  description = "Replication type for the storage account"
  type        = string
  default     = "LRS"
}

variable "tls_version" {
  description = "Minimum TLS version for SQL server (non-production branch)"
  type        = string
}

# ── Locals ───────────────────────────────────────────────────────────────

locals {
  is_production = var.environment == "prd"

  common_tags = merge(var.tags, {
    environment = var.environment
    team        = "platform"
    cost_center = "cc-1001"
  })
}

# ── Resource Group ───────────────────────────────────────────────────────

resource "azurerm_resource_group" "main" {
  name     = "${var.project_name}-rg"
  location = var.location
  tags     = local.common_tags
}

# ── Networking ───────────────────────────────────────────────────────────

resource "azurerm_virtual_network" "main" {
  name                = "${var.project_name}-vnet"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  address_space       = ["10.0.0.0/16"]
  tags                = local.common_tags
}

resource "azurerm_subnet" "internal" {
  name                 = "internal"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.1.0/24"]
}

resource "azurerm_network_security_group" "db" {
  name                = "${var.project_name}-db-nsg"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tags                = local.common_tags

  security_rule {
    name                       = "allow-ssh"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = "0.0.0.0/0"
    destination_address_prefix = "*"
  }
}

resource "azurerm_network_interface" "db" {
  name                = "${var.project_name}-db-nic"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.internal.id
    private_ip_address_allocation = "Dynamic"
  }

  network_security_group_id = azurerm_network_security_group.db.id
  tags                      = local.common_tags
}

# ── Storage ──────────────────────────────────────────────────────────────

resource "azurerm_storage_account" "data" {
  name                             = "${replace(var.project_name, "-", "")}data"
  resource_group_name              = azurerm_resource_group.main.name
  location                         = azurerm_resource_group.main.location
  account_tier                     = "Standard"
  account_replication_type         = var.storage_replication
  min_tls_version                  = "TLS1_2"
  allow_nested_items_to_be_public  = false
  public_network_access_enabled    = false
  tags                             = local.common_tags
}

resource "azurerm_storage_container" "data" {
  name                  = "data"
  storage_account_name  = azurerm_storage_account.data.name
  container_access_type = "private"
}

# ── MSSQL Server + Database ──────────────────────────────────────────────

resource "azurerm_mssql_server" "main" {
  name                         = "${var.project_name}-sql"
  resource_group_name          = azurerm_resource_group.main.name
  location                     = azurerm_resource_group.main.location
  version                      = "12.0"
  administrator_login          = "sqladmin"
  administrator_login_password = var.sql_admin_password
  minimum_tls_version          = local.is_production ? "1.2" : var.tls_version
  tags                         = local.common_tags
}

resource "azurerm_mssql_database" "main" {
  name      = "${var.project_name}-db"
  server_id = azurerm_mssql_server.main.id
  sku_name  = var.db_sku
  tags      = local.common_tags
}

# ── Key Vault ────────────────────────────────────────────────────────────

resource "azurerm_key_vault" "main" {
  name                       = "${replace(var.project_name, "-", "")}kv"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  tenant_id                  = "00000000-0000-0000-0000-000000000000"
  sku_name                   = "standard"
  purge_protection_enabled   = true
  tags                       = local.common_tags
}

resource "azurerm_key_vault_secret" "db_password" {
  name         = "sql-admin-password"
  key_vault_id = azurerm_key_vault.main.id
  value        = "placeholder-ref"
}

# ── AKS ──────────────────────────────────────────────────────────────────

resource "azurerm_kubernetes_cluster" "main" {
  name                       = "${var.project_name}-aks"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  dns_prefix                 = "${var.project_name}-aks"
  private_cluster_enabled    = true
  local_account_disabled     = true

  default_node_pool {
    name       = "default"
    node_count = 2
    vm_size    = "Standard_DS2_v2"
  }

  identity {
    type = "SystemAssigned"
  }

  tags = local.common_tags
}

# ── App Service ──────────────────────────────────────────────────────────

resource "azurerm_service_plan" "main" {
  name                = "${var.project_name}-asp"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "B1"
}

resource "azurerm_linux_web_app" "main" {
  name                = "${var.project_name}-app"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  service_plan_id     = azurerm_service_plan.main.id
  https_only          = true

  site_config {
    minimum_tls_version = "1.2"
  }

  tags = local.common_tags
}

# ── Monitoring ───────────────────────────────────────────────────────────

resource "azurerm_log_analytics_workspace" "main" {
  name                = "${var.project_name}-law"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_user_assigned_identity" "app" {
  name                = "${var.project_name}-identity"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tags                = local.common_tags
}

resource "azurerm_monitor_diagnostic_setting" "db" {
  name                       = "${var.project_name}-diag"
  target_resource_id         = azurerm_mssql_server.main.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  tags                       = local.common_tags

  enabled_log {
    category = "SQLSecurityAuditEvents"
  }
}

# ── Application Gateway ──────────────────────────────────────────────────

resource "azurerm_public_ip" "appgw" {
  name                = "${var.project_name}-appgw-pip"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = local.common_tags
}

resource "azurerm_application_gateway" "main" {
  name                = "${var.project_name}-appgw"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tags                = local.common_tags

  sku {
    name     = "Standard_v2"
    tier     = "Standard_v2"
    capacity = 2
  }

  gateway_ip_configuration {
    name      = "appgw-ip-config"
    subnet_id = azurerm_subnet.internal.id
  }

  frontend_port {
    name = "http"
    port = 80
  }

  frontend_ip_configuration {
    name                 = "appgw-frontend"
    public_ip_address_id = azurerm_public_ip.appgw.id
  }

  backend_address_pool {
    name = "appgw-backend"
  }

  backend_http_settings {
    name                  = "appgw-http-settings"
    cookie_based_affinity = "Disabled"
    port                  = 80
    protocol              = "Http"
    request_timeout       = 60
  }

  http_listener {
    name                           = "appgw-listener"
    frontend_ip_configuration_name = "appgw-frontend"
    frontend_port_name             = "http"
    protocol                       = "Http"
  }

  request_routing_rule {
    name                       = "appgw-rule"
    rule_type                  = "Basic"
    http_listener_name         = "appgw-listener"
    backend_address_pool_name  = "appgw-backend"
    backend_http_settings_name = "appgw-http-settings"
  }
}

# ── RBAC ─────────────────────────────────────────────────────────────────

resource "azurerm_role_assignment" "contributor" {
  scope              = azurerm_resource_group.main.id
  role_definition_name = "Contributor"
  principal_id       = azurerm_user_assigned_identity.app.principal_id
  principal_type     = "ServicePrincipal"
}

# ── Local Module (exercises module-following) ────────────────────────────

module "storage" {
  source              = "./modules/storage"
  environment         = var.environment
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
}

# ── Ungoverned resource (NOT in AzureResource enum) ──────────────────────

resource "azurerm_iot_security_solution" "iot" {
  name                = "${var.project_name}-iot"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tags                = local.common_tags
}

# ── Outputs ──────────────────────────────────────────────────────────────

output "storage_account_name" {
  description = "Primary storage account name"
  value       = azurerm_storage_account.data.name
}

output "sql_server_fqdn" {
  description = "SQL server FQDN"
  value       = azurerm_mssql_server.main.fully_qualified_domain_name
}

output "aks_cluster_name" {
  description = "AKS cluster name"
  value       = azurerm_kubernetes_cluster.main.name
}
