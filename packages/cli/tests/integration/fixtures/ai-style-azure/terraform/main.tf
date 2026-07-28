# ── Variables ────────────────────────────────────────────────────────────
# A typical AI-generated module: a few string vars, no validation, no
# sensitive marking (none of these names are secret-like, so the
# denyInsensitiveVariable rule does not fire — but the pattern is frail).

variable "env" {
  description = "Environment name (dev, stg, prod)"
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
  default     = "webapp-demo"
}

variable "sku" {
  description = "App Service plan SKU"
  type        = string
  default     = "B1"
}

# ── Locals ───────────────────────────────────────────────────────────────
# Pattern #15 — ternary on a non-governed attribute (engine exercise only;
# no rule targets sku_tier, so this neither violates nor degrades).

locals {
  is_prod     = var.env == "prod"
  common_tags = {
    team        = "platform"
    cost_center = "cc-1001"
    environment = var.env
  }
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

# Pattern #1 — NSG with public SSH. coreSecurity only governs the AWS
# SecurityGroup; cisAzure has no NSG ingress rule, so this is NOT caught by
# the default preset (an honest coverage gap).

resource "azurerm_network_security_group" "app" {
  name                = "${var.project_name}-nsg"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  # Pattern #11 — capitalized tag keys (inconsistent with common_tags).
  tags = {
    Team        = "platform"
    CostCenter  = "cc-1001"
    Environment = var.env
  }

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

# ── Storage Account ──────────────────────────────────────────────────────
# Patterns #2, #3, #4 (+ bonus: no network_rules default-deny, no
# public_network_access_enabled). An AI often emits the bare-minimum storage
# account, tripping several cisAzure controls at once.

resource "azurerm_storage_account" "data" {
  name                            = "${replace(var.project_name, "-", "")}data"
  resource_group_name             = azurerm_resource_group.main.name
  location                        = azurerm_resource_group.main.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  # Pattern #4 — weak TLS.
  min_tls_version                 = "TLS1_0"
  # Pattern #3 — public blob access allowed.
  allow_nested_items_to_be_public = true
  # Pattern #2 — https_only is not a real storage attribute (AI confusion
  # with web apps); omitted, and no cisAzure rule targets it on storage.
  # Bonus gap: public_network_access_enabled omitted (defaults true) and no
  # network_rules { default_action = "Deny" } block — both are cisAzure rules.
}

# ── MSSQL Server ─────────────────────────────────────────────────────────
# Pattern #5 (hardcoded password) + #6 (weak TLS).

resource "azurerm_mssql_server" "main" {
  name                          = "${var.project_name}-sql"
  resource_group_name           = azurerm_resource_group.main.name
  location                      = azurerm_resource_group.main.location
  version                       = "12.0"
  administrator_login           = "sqladmin"
  # Pattern #5 — hardcoded literal password (no denyLiteral rule in the
  # default preset, so this is NOT caught).
  administrator_login_password  = "P@ssw0rd123!"
  # Pattern #6 — weak TLS.
  minimum_tls_version           = "1.0"
  tags                          = local.common_tags
}

# ── Key Vault ────────────────────────────────────────────────────────────
# Pattern #7 — purge protection disabled.

resource "azurerm_key_vault" "main" {
  name                       = "${replace(var.project_name, "-", "")}kv"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  tenant_id                  = "00000000-0000-0000-0000-000000000000"
  sku_name                   = "standard"
  purge_protection_enabled   = false
  # Pattern #11 — no tags at all on this resource.
}

# ── App Service Plan + Linux Web App ─────────────────────────────────────
# Pattern #15 lives here: sku_tier is a hallucinated attribute (the real
# one is sku_name), included exactly as the task specifies for engine
# exercise. The web app itself is HTTPS-only (compliant) to avoid noise
# beyond the 15 listed patterns.

resource "azurerm_service_plan" "main" {
  name                = "${var.project_name}-asp"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = var.sku
  sku_tier            = local.is_prod ? "Standard" : "Basic"
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

# ── AKS ──────────────────────────────────────────────────────────────────
# Pattern #8 — not private. Also omits local_account_disabled (bonus
# violation from the same cisAzure rule pair).

resource "azurerm_kubernetes_cluster" "main" {
  name                = "${var.project_name}-aks"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  dns_prefix          = "${var.project_name}-aks"
  # private_cluster_enabled omitted (defaults false) — Pattern #8.
  # local_account_disabled omitted — bonus cisAzure violation.

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

# ── RBAC ─────────────────────────────────────────────────────────────────
# Pattern #9 — Contributor (too broad).

resource "azurerm_role_assignment" "contributor" {
  scope              = azurerm_resource_group.main.id
  role_definition_name = "Contributor"
  principal_id       = azurerm_kubernetes_cluster.main.kubelet_identity[0].object_id
}

# ── Utility resources (silently skipped by UTILITY_TYPES) ────────────────
# Pattern #12 — null_resource. Pattern #13 — tls_private_key. Neither
# appears in resources nor in ungoverned; they are invisible to the engine.

resource "null_resource" "placeholder" {
  triggers = {
    build_id = "initial"
  }
}

resource "tls_private_key" "deploy" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

# ── Ungoverned resource (NOT in the Azure vocabulary) ────────────────────
# Pattern #14 — azurerm_monitor_data_collection_rule is not in AzureResource
# and not a UTILITY_TYPE, so it surfaces as ungoverned.

resource "azurerm_monitor_data_collection_rule" "main" {
  name                = "${var.project_name}-dcr"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  destinations {
    log_analytics {
      workspace_resource_id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/${var.project_name}-rg/providers/Microsoft.OperationalInsights/workspaces/${var.project_name}-law"
      workspace_name        = "${var.project_name}-law"
    }
  }

  data_sources {
    performance_counter {
      name                       = "VMPerfCounters"
      streams                    = ["Microsoft-InsightsMetrics"]
      sampling_frequency_in_seconds = 60
      counter_specifiers         = ["\\Processor(_Total)\\% Processor Time"]
    }
  }
}

# ── Outputs ──────────────────────────────────────────────────────────────
# Pattern #10 — no terraform {} block at all (no backend, no encryption).
# coreSecurity has no requireEncryptedBackend rule, so this is NOT caught by
# the default preset.

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
