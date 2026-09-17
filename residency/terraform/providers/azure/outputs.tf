output "resource_group_name" {
  value = azurerm_resource_group.residency.name
}

output "aks_cluster_name" {
  value = azurerm_kubernetes_cluster.residency.name
}

output "acr_name" {
  value = azurerm_container_registry.workload.name
}

output "acr_login_server" {
  value = azurerm_container_registry.workload.login_server
}

output "workload_image_repository" {
  value = "${azurerm_container_registry.workload.login_server}/applied-ai-workload"
}

output "log_analytics_workspace_name" {
  value = azurerm_log_analytics_workspace.aks.name
}

output "oidc_issuer_url" {
  value = azurerm_kubernetes_cluster.residency.oidc_issuer_url
}
