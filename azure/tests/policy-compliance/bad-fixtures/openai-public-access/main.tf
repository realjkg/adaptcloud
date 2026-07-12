# Deliberately violates aiagent-deny-public-network: a Cognitive Services /
# OpenAI account with public network access ENABLED. Should be denied.

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" }
    random  = { source = "hashicorp/random", version = "~> 3.6" }
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
  name     = "rg-e2e-openai-public-${var.rg_suffix}"
  location = var.location
  tags = {
    agentOwner         = "e2e-test@adapt.example"
    agentPurpose       = "policy-denial-test"
    dataClassification = "Internal"
    expiresOn          = "2026-01-01"
  }
}

# Public network access ENABLED — the whole point.
resource "azurerm_cognitive_account" "bad" {
  name                          = "aoai-e2e-bad-${var.rg_suffix}"
  location                      = azurerm_resource_group.bad.location
  resource_group_name           = azurerm_resource_group.bad.name
  kind                          = "OpenAI"
  sku_name                      = "S0"
  custom_subdomain_name         = "aoai-e2e-bad-${var.rg_suffix}"
  public_network_access_enabled = true

  tags = azurerm_resource_group.bad.tags
}
