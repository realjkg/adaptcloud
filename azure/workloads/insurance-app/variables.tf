# ---------------------------------------------------------------------------
# Wiring from the application-platform landing zone
# ---------------------------------------------------------------------------
variable "insurance_subscription_id" {
  description = "Subscription ID of the insurance-app Application landing zone."
  type        = string
}

variable "location" {
  description = "Primary region (must be in the policy allow-list, e.g. eastus2)."
  type        = string
  default     = "eastus2"
}

variable "spoke_subnet_ids" {
  description = "Subnet IDs from the application-platform module: keys private_endpoints, power_platform, apim, workload_compute. May be left empty when enable_private_endpoints and enable_vnet_injection are both false (demo profile)."
  type        = map(string)
  default     = {}
}

variable "central_log_analytics_workspace_id" {
  description = "Central Log Analytics workspace resource ID (Application Insights components are bound to it)."
  type        = string
}

variable "ai_agents_group_object_id" {
  description = "Object ID of the 'ai-agents' Entra security group; all agent identities are added to it (Conditional Access target)."
  type        = string
}

variable "purview_account_id" {
  description = "Resource ID of the tenant Microsoft Purview account used for the AI audit / DSPM-for-AI connector. Leave empty to skip."
  type        = string
  default     = ""
}

variable "cicd_github_repo" {
  description = "GitHub org/repo allowed to assume the CI/CD identity via workload identity federation (subject = repo:<org>/<repo>:environment:insurance-prod). Leave empty to skip."
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------------
# Governance tags required by the ai-agent-governance policy initiative
# ---------------------------------------------------------------------------
variable "agent_owner" {
  description = "Owning team / DL for the insurance agent platform (agentOwner tag)."
  type        = string
  default     = "insurance-engineering@adapt.example"
}

variable "data_classification" {
  description = "Data classification of the workload (dataClassification tag): Public | Internal | Confidential | HighlyConfidential."
  type        = string
  default     = "Confidential"
}

variable "expires_on" {
  description = "Review/expiry date for the workload's agents (expiresOn tag), YYYY-MM-DD."
  type        = string
  default     = "2026-12-31"
}

variable "extra_tags" {
  description = "Additional tags merged onto all resources."
  type        = map(string)
  default     = {}
}

# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------
variable "agents" {
  description = "The agents to provision identities for. Each gets a user-assigned managed identity, an Entra app (for the Copilot Studio Entra Agent ID), membership in the ai-agents group, and scoped RBAC."
  type = map(object({
    purpose                = string
    needs_openai           = optional(bool, true)
    needs_search           = optional(bool, false)
    needs_content_safety   = optional(bool, true)
    keyvault_secret_reader = optional(bool, true)
    federated_subjects     = optional(list(string), [])
  }))
  default = {
    "policy-intake-agent" = {
      purpose              = "Quote intake and policy document understanding"
      needs_openai         = true
      needs_search         = true
      needs_content_safety = true
    }
    "claims-triage-agent" = {
      purpose              = "First-notice-of-loss triage and routing"
      needs_openai         = true
      needs_search         = true
      needs_content_safety = true
    }
    "underwriting-copilot" = {
      purpose              = "Underwriter assistant: risk summarisation and pricing guidance"
      needs_openai         = true
      needs_search         = true
      needs_content_safety = true
    }
    "fraud-signal-agent" = {
      purpose              = "Claims fraud-signal detection and case annotation"
      needs_openai         = true
      needs_search         = false
      needs_content_safety = true
    }
  }
}

# ---------------------------------------------------------------------------
# Cost / network posture toggles (see azure/COSTS.md and azure/profiles/)
# ---------------------------------------------------------------------------
variable "enable_private_endpoints" {
  description = "Create private endpoints for the AI plane / Key Vault / APIM and disable their public network access (the secure default). Set false ONLY for a low-cost demo — resources become publicly reachable, so run the governance policies in Audit mode and use non-sensitive data."
  type        = bool
  default     = true
}

variable "enable_vnet_injection" {
  description = "Inject the Power Platform environments into the spoke VNet (enterprise policy) and run API Management in Internal VNet mode. Set false for a demo without a spoke network."
  type        = bool
  default     = true
}

variable "enable_power_platform" {
  description = "Provision the Power Platform plane (Dataverse environments, Managed Environments, environment settings, DLP policies, and the VNet enterprise policy). Set false to deploy only the Azure AI plane (OpenAI/Search/Content Safety/AI Foundry), APIM, Key Vault, identities and observability — useful when the tenant has no Dataverse capacity or you don't need the low-code surface."
  type        = bool
  default     = true
}

variable "key_vault_purge_protection" {
  description = "Enable Key Vault purge protection (recommended for prod). When true, a destroyed vault stays soft-deleted for 90 days and CANNOT be force-purged — the name is unusable for that period. Set false for a demo you intend to tear down and rebuild."
  type        = bool
  default     = true
}

variable "apim_sku_name" {
  description = "API Management SKU. Developer_1 = non-prod, no SLA (~$50/mo); StandardV2_1 = ~$700/mo, supports VNet; Premium_1 (or more units) = ~$2,800/mo per unit, for prod multi-zone internal VNet; Consumption_0 = serverless pay-per-call, cheapest demo (but Consumption does NOT support Internal VNet, so pair it with enable_vnet_injection=false)."
  type        = string
  default     = "Developer_1"
}

# ---------------------------------------------------------------------------
# AI Foundry / Azure OpenAI
# ---------------------------------------------------------------------------
variable "approved_model_deployments" {
  description = "Model deployments to create on the Azure OpenAI account. Must be on the policy 'allowedModelNames' list."
  type = list(object({
    name     = string
    model    = string
    version  = string
    capacity = number
    sku      = optional(string, "Standard")
  }))
  default = [
    { name = "gpt-4o", model = "gpt-4o", version = "2024-11-20", capacity = 30 },
    { name = "gpt-4o-mini", model = "gpt-4o-mini", version = "2024-07-18", capacity = 30 },
    { name = "text-embedding-3-large", model = "text-embedding-3-large", version = "1", capacity = 30 }
  ]
}

variable "ai_search_sku" {
  description = "SKU for the grounding Azure AI Search service. 'free' = $0 (no SLA, 3 indexes, dev only); 'basic' = ~$75/mo; 'standard' (S1) = ~$245/mo per search unit; higher tiers cost more. Billed while the service exists, idle or not."
  type        = string
  default     = "standard"
}

variable "ai_search_replica_count" {
  description = "Azure AI Search replica count. Search units billed = replicas x partitions. Use 1 for demo/dev, 2+ for query SLA, 3+ for indexing+query SLA. Ignored on the 'free' SKU."
  type        = number
  default     = 2
}

variable "ai_search_partition_count" {
  description = "Azure AI Search partition count (storage/scale). Ignored on the 'free' SKU."
  type        = number
  default     = 1
}

# ---------------------------------------------------------------------------
# Power Platform environments
# ---------------------------------------------------------------------------
variable "power_platform_location" {
  description = "Power Platform geo for the environments (e.g. unitedstates, europe)."
  type        = string
  default     = "unitedstates"
}

variable "power_platform_environments" {
  description = "Dataverse environments to create as Managed Environments."
  type = map(object({
    environment_type = string # Sandbox | Production
    description      = string
  }))
  default = {
    "insurance-dev"  = { environment_type = "Sandbox", description = "Insurance agent platform - development" }
    "insurance-test" = { environment_type = "Sandbox", description = "Insurance agent platform - test/UAT" }
    "insurance-prod" = { environment_type = "Production", description = "Insurance agent platform - production" }
  }
}

variable "maker_sharing_limit" {
  description = "Managed Environment limit on the number of users a maker can share an app with (0 = sharing disabled, -1 = no limit)."
  type        = number
  default     = 20
}

# ---------------------------------------------------------------------------
# DLP connector classification (adaptive — change posture here, not in code)
# ---------------------------------------------------------------------------
variable "business_connectors" {
  description = "Connector IDs placed in the 'Business' group: the widest set of certified/Microsoft-published connectors relevant to insurance + Azure + M365."
  type        = list(string)
  default = [
    "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", # Microsoft Dataverse
    "/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
    "/providers/Microsoft.PowerApps/apis/shared_office365", # Outlook
    "/providers/Microsoft.PowerApps/apis/shared_office365users",
    "/providers/Microsoft.PowerApps/apis/shared_teams",
    "/providers/Microsoft.PowerApps/apis/shared_onedriveforbusiness",
    "/providers/Microsoft.PowerApps/apis/shared_sql",
    "/providers/Microsoft.PowerApps/apis/shared_azureblob",
    "/providers/Microsoft.PowerApps/apis/shared_azurequeues",
    "/providers/Microsoft.PowerApps/apis/shared_servicebus",
    "/providers/Microsoft.PowerApps/apis/shared_eventhubs",
    "/providers/Microsoft.PowerApps/apis/shared_azureopenai",
    "/providers/Microsoft.PowerApps/apis/shared_cognitiveservicestextanalytics",
    "/providers/Microsoft.PowerApps/apis/shared_cognitiveservicescomputervision",
    "/providers/Microsoft.PowerApps/apis/shared_formrecognizer", # Document Intelligence
    "/providers/Microsoft.PowerApps/apis/shared_aibuilder",
    "/providers/Microsoft.PowerApps/apis/shared_dynamicssmb",
    "/providers/Microsoft.PowerApps/apis/shared_dynamicsnav",
    "/providers/Microsoft.PowerApps/apis/shared_dynamics365businesscentral",
    "/providers/Microsoft.PowerApps/apis/shared_salesforce",
    "/providers/Microsoft.PowerApps/apis/shared_docusign",
    "/providers/Microsoft.PowerApps/apis/shared_adobesign",
    "/providers/Microsoft.PowerApps/apis/shared_approvals",
    "/providers/Microsoft.PowerApps/apis/shared_flowapproval",
    "/providers/Microsoft.PowerApps/apis/shared_excelonlinebusiness",
    "/providers/Microsoft.PowerApps/apis/shared_word", # Word Online (Business)
    "/providers/Microsoft.PowerApps/apis/shared_powerbi",
    "/providers/Microsoft.PowerApps/apis/shared_azureautomation"
  ]
}

variable "non_business_connectors" {
  description = "Connector IDs placed in the 'Non-Business' (general/personal-productivity) group."
  type        = list(string)
  default = [
    "/providers/Microsoft.PowerApps/apis/shared_rss",
    "/providers/Microsoft.PowerApps/apis/shared_msnweather",
    "/providers/Microsoft.PowerApps/apis/shared_bingmaps"
  ]
}

variable "blocked_connectors" {
  description = "Connector IDs explicitly blocked everywhere (social, consumer storage, unsanctioned AI, 'send to anyone')."
  type        = list(string)
  default = [
    "/providers/Microsoft.PowerApps/apis/shared_twitter",
    "/providers/Microsoft.PowerApps/apis/shared_facebook",
    "/providers/Microsoft.PowerApps/apis/shared_instagram",
    "/providers/Microsoft.PowerApps/apis/shared_youtube",
    "/providers/Microsoft.PowerApps/apis/shared_dropbox",
    "/providers/Microsoft.PowerApps/apis/shared_box",
    "/providers/Microsoft.PowerApps/apis/shared_googledrive",
    "/providers/Microsoft.PowerApps/apis/shared_gmail",
    "/providers/Microsoft.PowerApps/apis/shared_onedrive",    # consumer OneDrive
    "/providers/Microsoft.PowerApps/apis/shared_sendmail",    # SMTP "send as anyone"
    "/providers/Microsoft.PowerApps/apis/shared_webcontents", # arbitrary HTTP with auth
    "/providers/Microsoft.PowerApps/apis/shared_openai"       # non-Azure OpenAI
  ]
}

variable "custom_connector_allowed_url_patterns" {
  description = "URL patterns custom connectors are allowed to target (the APIM gateway host). Everything else is blocked."
  type        = list(string)
  default     = ["https://apim-insurance-app.azure-api.net/*"]
}

variable "apim_publisher_name" {
  type    = string
  default = "Adapt Insurance Platform"
}

variable "apim_publisher_email" {
  type    = string
  default = "platform@adapt.example"
}
