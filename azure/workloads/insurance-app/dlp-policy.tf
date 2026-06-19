# ---------------------------------------------------------------------------
# Data Loss Prevention (DLP) — connector governance.
#
# CAF / Power Platform guidance: classify the connector catalog into
# Business / Non-Business / Blocked, default unknown connectors to a safe group,
# block risky connectors, and restrict custom connectors. We ship two policies:
#   * a tenant-wide BASELINE that blocks the worst connectors everywhere;
#   * an ENVIRONMENT-SCOPED policy for the insurance environments that puts the
#     widest set of certified connectors in Business and pins custom connectors
#     to the APIM gateway host.
# Connector lists live in variables.tf -> adaptive: change the posture there.
# ---------------------------------------------------------------------------

# --- tenant baseline: block the high-risk connectors everywhere ------------
resource "powerplatform_data_loss_prevention_policy" "tenant_baseline" {
  count                             = var.enable_power_platform ? 1 : 0
  display_name                      = "Tenant baseline - block high-risk connectors"
  default_connectors_classification = "General" # unknown/new connectors land in Non-Business by default at tenant scope
  environment_type                  = "AllEnvironments"
  environments                      = []

  business_connectors     = []
  non_business_connectors = []

  blocked_connectors = [
    for id in var.blocked_connectors : {
      id                           = id
      default_action_rule_behavior = ""
      action_rules                 = []
      endpoint_rules               = []
    }
  ]

  custom_connectors_patterns = [
    { order = 1, host_url_pattern = "*", data_group = "Blocked" } # no custom connectors by default at tenant scope
  ]
}

# --- insurance environments: the working policy ----------------------------
resource "powerplatform_data_loss_prevention_policy" "insurance" {
  count                             = var.enable_power_platform ? 1 : 0
  display_name                      = "Insurance agent platform - connector governance"
  default_connectors_classification = "Blocked"
  environment_type                  = "OnlyEnvironments"
  environments                      = [for e in powerplatform_environment.this : e.id]

  # Widest array of template connectivity: certified Microsoft + Azure + LOB
  # connectors that the insurance apps/agents are allowed to use.
  business_connectors = [
    for id in var.business_connectors : {
      id                           = id
      default_action_rule_behavior = "Allow"
      action_rules                 = []
      endpoint_rules               = []
    }
  ]

  non_business_connectors = [
    for id in var.non_business_connectors : {
      id                           = id
      default_action_rule_behavior = "Allow"
      action_rules                 = []
      endpoint_rules               = []
    }
  ]

  blocked_connectors = [
    for id in var.blocked_connectors : {
      id                           = id
      default_action_rule_behavior = ""
      action_rules                 = []
      endpoint_rules               = []
    }
  ]

  # Custom connectors are only allowed when they target the APIM gateway host.
  custom_connectors_patterns = concat(
    [
      for i, pattern in var.custom_connector_allowed_url_patterns : {
        order            = i + 1
        host_url_pattern = pattern
        data_group       = "Business"
      }
    ],
    [
      { order = length(var.custom_connector_allowed_url_patterns) + 1, host_url_pattern = "*", data_group = "Blocked" }
    ]
  )
}
