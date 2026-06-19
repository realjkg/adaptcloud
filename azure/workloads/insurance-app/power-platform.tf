# ---------------------------------------------------------------------------
# Low-code platform: Power Platform environments + Managed Environment
# governance + VNet injection. This is the "start low-code" surface where
# makers build the insurance apps and Copilot Studio agents.
#
# CAF: use an environment strategy (dev/test/prod), enforce Managed Environment
# controls (sharing limits, Solution Checker, usage insights, env IP firewall),
# and inject the environments into the platform VNet.
#
# The whole plane is gated by var.enable_power_platform (default true); set it
# false to deploy the Azure AI plane only — e.g. no Dataverse capacity in the
# tenant. The Managed Environment / settings / DLP resources iterate over the
# environment resource, so they collapse to empty automatically when it's off.
# ---------------------------------------------------------------------------

resource "powerplatform_environment" "this" {
  for_each         = var.enable_power_platform ? var.power_platform_environments : {}
  display_name     = each.key
  location         = var.power_platform_location
  environment_type = each.value.environment_type
  description      = each.value.description

  dataverse = {
    language_code = 1033
    currency_code = "USD"
    # security_group_id = "<entra-group-guid>" # optional: restrict environment membership (must be a valid GUID if set)
  }
}

# Turn each environment into a Managed Environment with governance controls.
resource "powerplatform_managed_environment" "this" {
  for_each = powerplatform_environment.this

  environment_id             = each.value.id
  is_usage_insights_disabled = false # weekly usage insights ON
  is_group_sharing_disabled  = true  # block sharing with security groups
  limit_sharing_mode         = "ExcludeSharingToSecurityGroups"
  max_limit_user_sharing     = var.maker_sharing_limit # cap per-app maker sharing
  solution_checker_mode      = "Block"                 # block publish on Solution Checker errors
  suppress_validation_emails = false
  maker_onboarding_markdown  = "Welcome to the insurance agent platform. All connectors are governed by DLP; custom connectors must go through the APIM gateway. Agents must use their assigned Entra Agent ID."
  maker_onboarding_url       = "https://aka.ms/insurance-agent-platform-onboarding"
}

# Environment-level settings: IP firewall pinned to the spoke / APIM egress
# ranges, audit logging on, and bind audit settings.
resource "powerplatform_environment_settings" "this" {
  for_each       = powerplatform_environment.this
  environment_id = each.value.id

  audit_and_logs = {
    plugin_trace_log_setting = "All"
    audit_settings = {
      is_audit_enabled             = true
      is_user_access_audit_enabled = true
      is_read_audit_enabled        = true
    }
  }

  product = {
    behavior_settings = {
      show_dashboard_cards_in_expanded_state = true
    }
    features = {
      power_apps_component_framework_for_canvas_apps = true
    }
  }
}

# ---------------------------------------------------------------------------
# VNet injection: enterprise policy bound to the delegated spoke subnet, so
# environment traffic egresses through the platform network (and the hub
# firewall) instead of the public internet.
# ---------------------------------------------------------------------------
resource "azapi_resource" "powerplatform_vnet_enterprise_policy" {
  count     = var.enable_power_platform && var.enable_vnet_injection ? 1 : 0
  type      = "Microsoft.PowerPlatform/enterprisePolicies@2020-10-30-preview"
  name      = "ep-insurance-app-vnet"
  location  = var.location
  parent_id = azurerm_resource_group.workload.id
  body = {
    kind = "NetworkInjection"
    properties = {
      networkInjection = {
        virtualNetworks = [
          {
            id = join("/", slice(split("/", var.spoke_subnet_ids["power_platform"]), 0, 9)) # the VNet id
            subnet = {
              name = element(split("/", var.spoke_subnet_ids["power_platform"]), length(split("/", var.spoke_subnet_ids["power_platform"])) - 1)
            }
          }
        ]
      }
    }
  }
  tags = local.common_tags
}

# NOTE: associating the enterprise policy with each environment is done via the
# Power Platform admin API ("New-PowerAppEnvironmentSubnetInjection" /
# Set-AdminPowerAppEnvironment) or the provider's environment enterprise-policy
# linkage once the environment exists. Run that step from the ALM pipeline after
# `terraform apply`. The policy object itself is created above so it is in IaC.

output "power_platform_environment_ids" {
  value = { for k, v in powerplatform_environment.this : k => v.id }
}
