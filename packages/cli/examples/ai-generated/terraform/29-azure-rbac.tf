# Prompt: "a custom Azure role and a role assignment for my app"
# AI reaches for actions = ["*"] and assigns Owner — the RBAC over-permission
# anti-pattern (the analog of an AWS Action:"*" wildcard).
resource "azurerm_role_definition" "bad" {
  name  = "app-custom"
  scope = "/subscriptions/00000000"

  permissions {
    actions      = ["*"] # all actions -> violation
    not_actions  = []
    data_actions = []
  }
}

resource "azurerm_role_definition" "good" {
  name  = "app-reader"
  scope = "/subscriptions/00000000"

  permissions {
    actions     = ["Microsoft.Storage/storageAccounts/read"]
    not_actions = []
  }
}

resource "azurerm_role_assignment" "owner" {
  scope                = "/subscriptions/00000000"
  role_definition_name = "Owner" # -> warn
  principal_id         = "00000000-0000-0000-0000-000000000000"
}

resource "azurerm_role_assignment" "reader" {
  scope                = "/subscriptions/00000000"
  role_definition_name = "Reader" # scoped -> passes
  principal_id         = "00000000-0000-0000-0000-000000000000"
}
