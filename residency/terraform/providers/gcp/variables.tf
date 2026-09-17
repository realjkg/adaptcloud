variable "project_id" {
  description = "Student-owned Google Cloud project ID."
  type        = string
}

variable "environment" {
  description = "Residency environment boundary."
  type        = string
  default     = "dev"
  validation {
    condition     = contains(["dev", "qa", "staging", "prod"], var.environment)
    error_message = "environment must be dev, qa, staging, or prod"
  }
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "zone" {
  description = "Zonal GKE keeps the student lab footprint smaller than a regional node deployment."
  type        = string
  default     = "us-central1-a"
}

variable "machine_type" {
  type    = string
  default = "e2-standard-2"
}

variable "node_count" {
  type    = number
  default = 1
  validation {
    condition     = var.node_count >= 1 && var.node_count <= 3
    error_message = "student lab node_count must be between 1 and 3"
  }
}

variable "subnet_cidr" {
  type    = string
  default = "10.52.0.0/20"
}

variable "pods_cidr" {
  type    = string
  default = "10.56.0.0/14"
}

variable "services_cidr" {
  type    = string
  default = "10.60.0.0/20"
}

variable "control_plane_cidr" {
  type    = string
  default = "172.16.1.0/28"
}
