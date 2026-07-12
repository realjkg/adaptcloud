# Deliberately violates aiagent-require-tags: a resource group without the
# required agentOwner / agentPurpose / dataClassification / expiresOn tags.
# Should be denied.

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

# No tags map at all — the initiative's require-tags policy denies this.
resource "azurerm_resource_group" "bad" {
  name     = "rg-e2e-missing-tags-${var.rg_suffix}"
  location = var.location
}
