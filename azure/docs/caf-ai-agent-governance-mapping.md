# CAF "Govern and secure AI agents across your organization": how each control is met

Source guidance:
- <https://learn.microsoft.com/azure/cloud-adoption-framework/ai-agents/governance-security-across-organization>
- <https://learn.microsoft.com/azure/cloud-adoption-framework/scenarios/ai/> (AI landing zone / Application landing zone)
- <https://learn.microsoft.com/power-platform/guidance/adoption/dlp-strategy> (Power Platform DLP)
- <https://learn.microsoft.com/microsoft-copilot-studio/security-and-governance> (Copilot Studio governance)
- <https://learn.microsoft.com/entra/identity/> (Microsoft Entra Agent ID: identities for agents rather than people)

The Cloud Adoption Framework (CAF) article groups AI agent governance into five
areas. The tables below list each recommendation and the file in this repo that
puts it into practice.

## 1. Identify and inventory agents

| CAF recommendation | Implementation |
|---|---|
| Treat every agent as its own named identity (a new kind of identity). | `workloads/insurance-app/identity-agents.tf`: for each agent (`policy-intake-agent`, `claims-triage-agent`, `underwriting-copilot`), one `azuread_application` and service principal **or** one `azurerm_user_assigned_identity`. Copilot Studio and AI Foundry agents get an **Entra Agent ID** automatically when they're created in a Managed Environment; Terraform records and tags them. |
| Keep a list of all agents and their owners. | The `require-agent-resource-tags` policy requires the tags `agentName`, `agentOwner`, `agentPurpose` and `dataClassification`. The Power Platform **CoE Starter Kit** (see `workloads/insurance-app/README.md`) keeps the live list. |
| Retire agents that aren't used. | Lifecycle notes and the `expiresOn` tag in `workloads/insurance-app/variables.tf`; access reviews, recommended in `docs` (see "Operating model"). |

## 2. Govern agent identity and access

| CAF recommendation | Implementation |
|---|---|
| Give each agent its own identity; never share a person's identity or act as a person. | One identity per agent in `identity-agents.tf`; no agent uses a user account or a shared service principal. |
| Use managed identities or workload identity federation instead of secrets. | `azurerm_user_assigned_identity` and `azuread_application_federated_identity_credential` for agents that run on Azure compute or in GitHub Actions; **no client secrets are created**. Any key that can't be avoided is kept in Key Vault (`key-vault.tf`). |
| Give agents only the access they need, through limited roles and API permissions. | Narrow `azurerm_role_assignment`s (for example `Cognitive Services OpenAI User`, `Key Vault Secrets User`, `Search Index Data Reader`) on the one resource they need, not the whole subscription. |
| Apply Conditional Access to agent identities. | `identity-agents.tf` puts the identities in the `ai-agents` security group. A Conditional Access policy (named `CA-AI-Agents-Restrict`, managed in Entra and described here) blocks legacy sign-in methods, allows agents only from the workload's named locations and IP ranges, and blocks interactive sign-in. |
| Use Privileged Identity Management (PIM) or just-in-time access for any higher agent access. | Described in the operating model; higher roles must be activated when needed, never held permanently. |

## 3. Run agents inside a landing zone (Application Platform landing zone)

| CAF recommendation | Implementation |
|---|---|
| Put agent workloads in an **application landing zone** under the **Application Platform** management group. **If it doesn't exist, create it.** | `landing-zones/application-platform/management-group.tf` creates the `alz-application-platform` management group (under the platform's "Landing Zones" management group) **only if it doesn't exist yet**. Then `subscription-vending.tf` creates the `insurance-app` subscription, or moves the existing one, under it. |
| Connect the workload's spoke network to the network hub, and use the platform's DNS, firewall and monitoring. | `landing-zones/application-platform/networking.tf`: the spoke VNet, its subnets (`snet-privateendpoints`, `snet-powerplatform-vnet-injection`, `snet-apim`), peering to the hub VNet and links to the platform's Private DNS zones. `monitoring.tf` connects the spoke to the central Log Analytics workspace. |
| Reach all Azure services through private endpoints, with public network access turned off. | `workloads/insurance-app/networking.tf` creates private endpoints for AI Foundry, Azure OpenAI, AI Search, Key Vault, Storage and APIM, with `publicNetworkAccess = "Disabled"` everywhere. Outbound traffic must go through the hub's Azure Firewall (set by a user-defined route). The `deny-ai-public-network-access` policy enforces this. |

## 4. Govern data and content (responsible AI)

| CAF recommendation | Implementation |
|---|---|
| Use Microsoft Purview and DSPM for AI to catalog data, apply sensitivity labels and DLP, and audit prompts and responses. | `workloads/insurance-app/observability.tf` uses the tenant's Purview account and turns on the AI audit connector. Sensitivity labels are enforced across the tenant, as described here. |
| Let agents answer only from approved data, and respect access based on labels. | The AI Search data sources are listed one by one in `variables.tf`; the Copilot Studio agents are set up (in the Managed Environment) to use only those sources. |
| Use content safety (protection against jailbreaks and prompt attacks, checks that answers match sources, blocklists). | `ai-foundry.tf` creates an **Azure AI Content Safety** resource and a default blocklist. The **Microsoft Defender for Cloud AI threat protection** plan is turned on in `landing-zones/application-platform/monitoring.tf`. |
| Have a person approve sensitive actions. | Copilot Studio topics for binding, quoting and payouts require confirmation, as described in `workloads/insurance-app/README.md`. |

## 5. Govern with policy as code

| CAF recommendation | Implementation (`policy-as-code/`) |
|---|---|
| Restrict the regions AI resources can deploy to. | `definitions/allowed-ai-locations.json` |
| Allow only approved models. | `definitions/allowed-aoai-model-deployments.json` (its parameter is a list of `model.name`/`model.version` pairs, for example `gpt-4o`, `text-embedding-3-large`). |
| Block public network access to AI resources, and require private endpoints. | `definitions/deny-ai-public-network-access.json` |
| Turn off key-based sign-in on Cognitive Services and AI resources, so only Entra ID works. | `definitions/deny-cognitive-services-local-auth.json` |
| Check for, or require, a managed identity on resources that run agents. | `definitions/audit-managed-identity-on-agents.json` |
| Require AI and Power Platform resources to send diagnostics to the central Log Analytics workspace. | `definitions/require-diagnostic-settings-ai.json` |
| Require owner and classification tags on agent resources. | `definitions/require-agent-resource-tags.json` |
| Group them into one initiative and assign it to the Application Platform management group. | `initiative/ai-agent-governance-initiative.json` and `initiative/policy_assignments.tf`. It's assigned to `alz-application-platform` with a managed identity for the `deployIfNotExists`/`modify` effects, and includes a way to grant an exemption in an emergency. |

## 6. Low-code platform governance (Power Platform / Copilot Studio)

| CAF recommendation | Implementation (`workloads/insurance-app/`) |
|---|---|
| Use separate dev, test and prod environments. | `power-platform.tf` creates the `insurance-dev`, `insurance-test` and `insurance-prod` environments, each with Dataverse. |
| Use **Managed Environments** for governance (sharing limits, solution checker, usage insights, IP firewall, customer-managed keys). | `power-platform.tf` makes each environment **Managed**, limits how widely makers can share, requires Solution Checker before publishing, turns on weekly usage insights, and limits the environment's IP firewall to the spoke's address ranges. |
| Use **DLP policies** that sort the connector catalog (Business, Non-Business, Blocked) and limit custom connectors. | `dlp-policy.tf`: a tenant-wide "baseline" DLP policy plus a policy for these environments. Insurance business, Microsoft 365 and Azure connectors → **Business**; general utility connectors → **Non-Business**; social media, consumer storage, unapproved AI and "send to anyone" connectors → **Blocked**. Custom connectors are limited to one approved URL pattern (the APIM gateway host). The connector lists are variables, so they're easy to change. |
| Put Azure API Management in front of custom and API connectors. | `connectors-apim.tf` creates an APIM instance inside the VNet. `connectors/insurance-policy-api.openapi.yaml` and `connectors/claims-api.openapi.yaml` are imported as APIM APIs and published as Power Platform **custom connectors** that sign in with Entra ID. |
| Offer as many ready-made connectors as possible. | The DLP "Business" group starts with every Microsoft-published or certified connector that's useful for insurance (Dataverse, SharePoint, Outlook, Teams, SQL, Azure Blob, Service Bus, Azure OpenAI, AI Builder, DocuSign, Adobe Sign, Salesforce, Dynamics 365 and more). See `business_connectors` in `variables.tf`. |
| Copilot Studio agents sign in with Entra ID, use only approved knowledge, are released through solutions and pipelines, and get an Entra Agent ID. | Described here, and enforced by the Managed Environment and DLP. Agents are released through Power Platform pipelines (see `README.md`). |

## 7. Observability and traceability

| CAF recommendation | Implementation |
|---|---|
| One central place for logs, and a security information and event management (SIEM) tool. | Central Log Analytics in `landing-zones/application-platform/monitoring.tf`, with Microsoft Sentinel added to that workspace and diagnostic settings required by policy. |
| Telemetry for each agent. | `workloads/insurance-app/observability.tf`: one Application Insights component per agent, connected to the central workspace. |
| Record who or what called the agent, which tools and connectors ran, what data was used, and the prompts and responses. | Purview AI audit, Power Platform activity logs, APIM request logs in Log Analytics and AI Foundry trace export. Every action can be traced back to the agent's Entra Agent ID through the `agentName` dimension. |
| AI threat protection. | The Defender for Cloud AI plan (detects prompt injection and unusual use), turned on for the subscription. |

## Operating model (who owns what)

| Team | Owns |
|---|---|
| **Platform** | `landing-zones/application-platform/`, `policy-as-code/`, hub networking, central Log Analytics/Sentinel, Defender plans, the tenant DLP baseline. |
| **Workload (insurance)** | `workloads/insurance-app/`: the Power Platform environments, the agents, the APIM connectors, and the workload's Key Vault and App Insights. |
| **Security / Identity** | Creating and retiring Entra Agent IDs, Conditional Access for agent identities, access reviews, Purview labels and DSPM for AI, and Sentinel content. |

The `ai-agents` group is reviewed every quarter. Any agent with no owner, or past
the date in its `expiresOn` tag, is disabled and then deleted.
