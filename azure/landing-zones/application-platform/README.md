# Application Platform landing zone

The CAF AI agent governance guidance says agent workloads must live in an
**application landing zone** under an **Application Platform management group**.
This module **creates that management group if it doesn't exist yet**. Then it
creates the `insurance-app` workload landing zone under it, connects the
landing zone's spoke network to the network hub, and connects it to central
monitoring.

The **platform team** runs this, before deploying any workload or policy.

## What it creates

| File | Resources |
|---|---|
| `management-group.tf` | The `alz-application-platform` management group, under the platform's "Landing Zones" management group. It looks for an existing one first and creates it only if there isn't one. |
| `subscription-vending.tf` | Uses the existing `insurance-app` subscription (or creates one with `azurerm_subscription`) and moves it under `alz-application-platform`. Adds the platform tags and a budget. |
| `networking.tf` | The spoke VNet (`vnet-insurance-app`) and its subnets: `snet-privateendpoints`, `snet-powerplatform` (delegated to `Microsoft.PowerPlatform/enterprisePolicies` for VNet injection) and `snet-apim`. VNet peering to the hub, links to the platform's Private DNS zones for the Azure services the workload uses, and a route table that sends all outbound traffic through the hub firewall. |
| `identity.tf` | The platform's user-assigned managed identity, which the policy initiative uses for its `deployIfNotExists`/`modify` fixes; and the `ai-agents` Entra security group that agent identities go into (and that Conditional Access targets). |
| `monitoring.tf` | The central Log Analytics workspace (or a link to the platform's), Microsoft Sentinel on that workspace, Defender for Cloud plans including **AI threat protection**, and an Activity Log diagnostic setting. |

## Inputs

See `variables.tf` and `terraform.tfvars.example`. The main ones:

- `platform_landing_zones_mg_id` — the platform's existing "Landing Zones" management group to put this under.
- `hub_vnet_id`, `hub_firewall_private_ip`, `platform_private_dns_zone_ids` — details of the network hub.
- `insurance_subscription_id` — the subscription to put under the new management group. Leave it blank to create a new one, if you have an enterprise (EA or MCA) billing account.
- `central_log_analytics_workspace_id` — set this to reuse the platform's workspace instead of creating a new one.
