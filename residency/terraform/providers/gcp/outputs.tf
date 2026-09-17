output "provider" {
  value = "gcp"
}

output "environment" {
  value = var.environment
}

output "project_id" {
  value = var.project_id
}

output "region" {
  value = var.region
}

output "zone" {
  value = var.zone
}

output "cluster_name" {
  value = google_container_cluster.residency.name
}

output "artifact_repository" {
  value = google_artifact_registry_repository.workload.repository_id
}

output "artifact_registry_host" {
  value = "${var.region}-docker.pkg.dev"
}

output "workload_image_repository" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.workload.repository_id}/applied-ai-workload"
}

output "network" {
  value = google_compute_network.residency.name
}
