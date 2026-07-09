# Prompt: "an Azure network security group for my app VM"
# AI commonly opens SSH/RDP to "*" (the whole internet).
resource "azurerm_network_security_group" "app" {
  name                = "app-nsg"
  location            = "eastus"
  resource_group_name = "app-rg"

  security_rule {
    name                       = "allow-ssh"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = "*" # the whole internet -> violation
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "allow-internal-https"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "10.0.0.0/8" # internal only -> passes
    destination_address_prefix = "*"
  }
}

# Standalone rule form: RDP open to the internet (service tag) -> violation.
resource "azurerm_network_security_rule" "rdp" {
  name                        = "allow-rdp"
  priority                    = 200
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_range      = "3389"
  source_address_prefix       = "Internet"
  destination_address_prefix  = "*"
  resource_group_name         = "app-rg"
  network_security_group_name = azurerm_network_security_group.app.name
}
