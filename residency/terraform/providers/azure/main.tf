terraform {
  required_version = ">= 1.8.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.4"
    }
  }
}

provider "azurerm" {
  subscription_id                 = var.subscription_id
  resource_provider_registrations = "none"
  features {}
}

locals {
  name = "adapt-residency-${var.environment}"
  tags = {
    Project     = "applied-ai-residency"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
  acr_name = "adaptres${substr(md5(var.subscription_id), 0, 8)}${var.environment}"
}

resource "azurerm_resource_group" "residency" {
  name     = "${local.name}-rg"
  location = var.location
  tags     = local.tags
}

resource "azurerm_virtual_network" "residency" {
  name                = "${local.name}-vnet"
  location            = azurerm_resource_group.residency.location
  resource_group_name = azurerm_resource_group.residency.name
  address_space       = [var.vnet_cidr]
  tags                = local.tags
}

resource "azurerm_subnet" "aks" {
  name                 = "aks-nodes"
  resource_group_name  = azurerm_resource_group.residency.name
  virtual_network_name = azurerm_virtual_network.residency.name
  address_prefixes     = [var.node_subnet_cidr]
}

resource "azurerm_container_registry" "workload" {
  name                = local.acr_name
  resource_group_name = azurerm_resource_group.residency.name
  location            = azurerm_resource_group.residency.location
  sku                 = "Basic"
  admin_enabled       = false
  role_assignment_mode = "LegacyRegistryPermissions"
  tags                = local.tags
}

resource "azurerm_log_analytics_workspace" "aks" {
  name                = "${local.name}-logs"
  location            = azurerm_resource_group.residency.location
  resource_group_name = azurerm_resource_group.residency.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.tags
}

resource "azurerm_kubernetes_cluster" "residency" {
  name                = local.name
  location            = azurerm_resource_group.residency.location
  resource_group_name = azurerm_resource_group.residency.name
  dns_prefix          = local.name
  sku_tier            = "Free"

  oidc_issuer_enabled       = true
  workload_identity_enabled = true

  default_node_pool {
    name                 = "system"
    vm_size              = var.node_vm_size
    node_count           = var.node_count
    vnet_subnet_id       = azurerm_subnet.aks.id
    auto_scaling_enabled = false
    os_disk_size_gb      = 64
    only_critical_addons_enabled = false
    tags                 = local.tags
  }

  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin      = "azure"
    network_plugin_mode = "overlay"
    network_data_plane  = "cilium"
    network_policy      = "cilium"
    pod_cidr            = var.pod_cidr
    service_cidr        = var.service_cidr
    dns_service_ip      = var.dns_service_ip
    load_balancer_sku   = "standard"
    outbound_type       = "loadBalancer"
  }

  oms_agent {
    log_analytics_workspace_id      = azurerm_log_analytics_workspace.aks.id
    msi_auth_for_monitoring_enabled = true
  }

  tags = local.tags
}

resource "azurerm_role_assignment" "aks_acr_pull" {
  scope                            = azurerm_container_registry.workload.id
  role_definition_name             = "AcrPull"
  principal_id                     = azurerm_kubernetes_cluster.residency.kubelet_identity[0].object_id
  skip_service_principal_aad_check = true
}
