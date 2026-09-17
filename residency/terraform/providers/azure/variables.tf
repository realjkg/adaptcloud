variable "subscription_id" {
  description = "Student-owned Azure subscription ID."
  type        = string
}

variable "environment" {
  description = "Residency environment."
  type        = string
  validation {
    condition     = contains(["dev", "qa", "staging", "prod"], var.environment)
    error_message = "environment must be dev, qa, staging, or prod."
  }
}

variable "location" {
  description = "Azure region for residency resources."
  type        = string
  default     = "eastus2"
}

variable "vnet_cidr" {
  type    = string
  default = "10.42.0.0/16"
}

variable "node_subnet_cidr" {
  type    = string
  default = "10.42.0.0/22"
}

variable "pod_cidr" {
  description = "Azure CNI Overlay pod address space; must not overlap VNet/service ranges."
  type        = string
  default     = "10.244.0.0/16"
}

variable "service_cidr" {
  type    = string
  default = "10.43.0.0/16"
}

variable "dns_service_ip" {
  type    = string
  default = "10.43.0.10"
}

variable "node_count" {
  description = "Small lab default; increase deliberately for later environments."
  type        = number
  default     = 1
  validation {
    condition     = var.node_count >= 1 && var.node_count <= 10
    error_message = "node_count must be between 1 and 10 for the residency lab."
  }
}

variable "node_vm_size" {
  type    = string
  default = "Standard_D2s_v5"
}
