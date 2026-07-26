# Deliberately violates aiagent-allowed-aoai-models: deploys `gpt-3.5-turbo`
# which is NOT in the initiative's default allowedModelNames (gpt-4o,
# gpt-4o-mini, text-embedding-3-large). Should be denied.

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}

variable "subscription_id" { type = string }
variable "rg_suffix" { type = string }
variable "location" {
  type    = string
  default = "eastus2"
}

resource "azurerm_resource_group" "bad" {
  name     = "rg-e2e-unapproved-model-${var.rg_suffix}"
  location = var.location
  tags = {
    agentOwner         = "e2e-test@adapt.example"
    agentPurpose       = "policy-denial-test"
    dataClassification = "Internal"
    expiresOn          = "2026-01-01"
  }
}

# A compliant OpenAI account (private + Entra auth) — so the only violation is
# the model deployment below.
resource "azurerm_cognitive_account" "compliant" {
  name                          = "aoai-e2e-um-${var.rg_suffix}"
  location                      = azurerm_resource_group.bad.location
  resource_group_name           = azurerm_resource_group.bad.name
  kind                          = "OpenAI"
  sku_name                      = "S0"
  custom_subdomain_name         = "aoai-e2e-um-${var.rg_suffix}"
  local_auth_enabled            = false
  public_network_access_enabled = false

  identity { type = "SystemAssigned" }
  network_acls { default_action = "Deny" }
  tags = azurerm_resource_group.bad.tags
}

# The offender: an unapproved model. Should trip aiagent-allowed-aoai-models.
resource "azurerm_cognitive_deployment" "bad" {
  name                 = "gpt-3.5-turbo"
  cognitive_account_id = azurerm_cognitive_account.compliant.id

  model {
    format  = "OpenAI"
    name    = "gpt-3.5-turbo"
    version = "0125"
  }

  sku {
    name     = "Standard"
    capacity = 1
  }
}
