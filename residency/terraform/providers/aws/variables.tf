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
  description = "AWS region. Keep AWS_REGION aligned with this value for CLI operations."
  type        = string
  default     = "us-east-2"
}

variable "vpc_cidr" {
  type    = string
  default = "10.42.0.0/16"
}

variable "kubernetes_version" {
  description = "EKS Kubernetes version. Verify supported versions before a live lab deployment."
  type        = string
  default     = "1.34"
}

variable "node_instance_type" {
  type    = string
  default = "t3.medium"
}

variable "node_min_size" { type = number; default = 1 }
variable "node_max_size" { type = number; default = 2 }
variable "node_desired_size" { type = number; default = 1 }
