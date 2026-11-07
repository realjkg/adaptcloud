# Adapt Cloud — Insurance Agent Platform on Azure

Infrastructure as code for an **insurance application**. It is built with
**low-code tools first** (Power Platform and Copilot Studio), with **API
connectors** added on top as needed. It runs inside an **Azure Landing Zone
(ALZ)**, and its rules are enforced with **policy as code**.

This folder puts into practice the Microsoft Cloud Adoption Framework (CAF)
guidance **"Govern and secure AI agents across your organization"**
(<https://learn.microsoft.com/azure/cloud-adoption-framework/ai-agents/governance-security-across-organization>)
and its guidance on AI landing zones and application landing zones.

## Why this layout

The CAF says three things about AI agents. They are a **new kind of identity**.
They must run inside an **application (workload) landing zone** that sits under
an **Application Platform management group**. And the rules that limit them must
be written as **policy as code**. If your tenant doesn't have an Application
Platform landing zone yet, you have to create one before adding agent workloads,
so this folder does that.

```
azure/
├── landing-zones/
│   └── application-platform/   # Creates the Application Platform MG + vends the
│                               # insurance-app workload subscription, spoke network,
│                               # central Log Analytics, platform managed identities.
├── policy-as-code/             # Azure Policy definitions + AI-agent governance
│                               # initiative (policy set) + assignments. Deployed by
│                               # the platform team at the Application Platform MG scope.
├── workloads/
│   └── insurance-app/          # The insurance workload landing zone:
│                               #  - Power Platform managed environment + DLP (connector
│                               #    classification) — low-code first
│                               #  - APIM-fronted custom/API connectors (templates)
│                               #  - Copilot Studio / AI Foundry agents, each with its
│                               #    own Entra Agent ID / user-assigned managed identity
│                               #  - Key Vault, Application Insights, private endpoints
└── docs/
    └── caf-ai-agent-governance-mapping.md   # Control-by-control traceability matrix
```

> **Rather click through it?** [`QUICKSTART-portal.md`](QUICKSTART-portal.md)
> walks through it step by step in the Azure portal, the Power Platform admin
> center, Copilot Studio and AI Foundry, and links each step to its Terraform file.
>
> **Cost and teardown?** See [`COSTS.md`](COSTS.md). Ready-made sets of
> variables, one for a ~$80–150/mo demo and one for production, are in
> [`profiles/`](profiles/).

## Order to build and deploy

1. **Platform team**: `landing-zones/application-platform/`. It creates the
   Application Platform management group and its subscription only if they don't
   exist yet, so it's safe to run again.
2. **Platform team**: `policy-as-code/`. It publishes the policy definitions and
   the `ai-agent-governance` initiative, and assigns the initiative to the
   Application Platform management group.
3. **Workload team**: `workloads/insurance-app/`. The low-code environment comes
   first, then connectors and AI Foundry agents on top, all inside the policy rules.

Each folder has its own `README.md`, `providers.tf`, `variables.tf` and
`terraform.tfvars.example`. None of this should go straight to production:
review it, set your own values, and run it through your own pipeline first.

## Sandbox quickstart (dev-demo)

The cheapest way to try the whole use case. It uses the
[`profiles/dev-demo`](profiles/) settings (~$80–150/mo: public endpoints,
Consumption APIM, Basic AI Search, one Power Platform sandbox, one agent). **Use
demo data only**: with public endpoints, the network-isolation rules are off.

### Prerequisites

- **Terraform ≥ 1.6** and **Azure CLI** — `az login` then `az account set --subscription <sandbox-sub-id>`.
- Providers are pulled on `terraform init`: `azurerm` ~4, `azuread` ~3, `azapi` ~2, `microsoft/power-platform` ~3.
- **Permissions** in the sandbox subscription:
  - **Owner** *and* **User Access Administrator** (the modules create role assignments).
  - Entra: rights to create **app registrations** and a **security group** (Application Administrator or Application Developer).
  - Full-stack path only: **Management Group Contributor** and **Resource Policy Contributor** on the management group.
- **Power Platform**: whoever is signed in must be a **Power Platform Service Admin** (the provider uses `use_cli = true`), and the tenant needs free **Dataverse capacity** to create the environment. No capacity? See the note below.

### Path A: workload only (fastest; skips the landing zone and policy)

Deploy only the agent workload into a sandbox subscription you already have.
Create or reuse a **Log Analytics workspace** and an **Entra security group**
(it can be empty), and note their IDs.

```bash
cd azure/workloads/insurance-app
terraform init
terraform apply \
  -var-file=../../profiles/dev-demo/insurance-app.tfvars \
  -var insurance_subscription_id=<sandbox-sub-id> \
  -var central_log_analytics_workspace_id=<existing-law-resource-id> \
  -var ai_agents_group_object_id=<existing-group-object-id>
```

This gives you no VNet, no private endpoints, Consumption APIM, Basic AI Search,
one Power Platform sandbox environment and one agent identity.

> **No Power Platform capacity, or you only want the Azure AI services?** Add
> `-var enable_power_platform=false`. That skips the Dataverse environments,
> Managed Environments, environment settings, data loss prevention (DLP)
> policies and the VNet enterprise policy. The Azure AI services (OpenAI, Search,
> Content Safety, AI Foundry), APIM, Key Vault, agent identities and monitoring
> still deploy.

### Path B: full stack with governance

1. `landing-zones/application-platform` with `-var-file=../../profiles/dev-demo/application-platform.tfvars`, plus your real IDs.
2. `policy-as-code/initiative` — **assign with `-var enforcement_mode=DoNotEnforce`.**
   **IMPORTANT:** the dev-demo workload uses **public endpoints**. If you assign the
   initiative in its default **Deny** mode, the `deny-ai-public-network-access`
   and `deny-cognitive-services-local-auth` policies **stop the workload from
   deploying**. `DoNotEnforce` still checks compliance, so you see what *would*
   fail, but doesn't block anything. Switch to `Default` when you move to the
   `prod` profile, which uses private endpoints.
3. `workloads/insurance-app` with the dev-demo profile, passing in the landing
   zone's outputs (`spoke_subnet_ids`, `central_log_analytics_workspace_id`,
   `ai_agents_group_object_id`).

### Verify

- `terraform output workload_summary` and `terraform output agent_identities`.
- Azure portal: the Azure OpenAI account and its two model deployments, Key Vault, and one Application Insights per agent.
- Power Platform admin center: the `insurance-demo` **Managed Environment** and the connector **DLP policy**.
- Copilot Studio: create an agent in `insurance-demo`. It gets an **Entra Agent ID**; check that it shows up in the `ai-agents` group in Entra. (Walkthrough: [`QUICKSTART-portal.md`](QUICKSTART-portal.md), step 4.)

### Tear down

```bash
terraform destroy   # same -var-file / -var flags as apply
```

With the dev-demo profile (`key_vault_purge_protection = false`, Consumption
APIM, Basic AI Search), nothing is left behind and nothing blocks a rebuild. The
teardown pitfalls (purge protection, soft delete) are in [`COSTS.md`](COSTS.md).

## Design principles (from the CAF article)

| Principle | How it shows up here |
|---|---|
| Agents are identities in their own right | Every agent gets its own **Entra Agent ID** (Copilot Studio or AI Foundry) or **user-assigned managed identity**. No shared identities, no acting as a person, no secrets in code. See `workloads/insurance-app/identity-agents.tf`. |
| Only the access each agent needs | Role assignments and connector permissions limited to what's needed, plus Conditional Access rules aimed at agent identities. |
| Run inside a landing zone | The workload gets its own **application landing zone** subscription, connected to the network hub. Azure services are reached only through private endpoints. |
| Policy as code | `policy-as-code/`: allowed regions, approved models, no public network access, required diagnostic settings, required owner and classification tags, and checks for managed identity and local sign-in being off. |
| Low-code first, with access to many connectors | A Power Platform **managed environment** and a **DLP policy** that sorts the whole connector catalog into Business, Non-Business and Blocked. Custom **API connectors** are generated from the OpenAPI specs in `workloads/insurance-app/connectors/`. |
| You can trace and monitor everything | Central Log Analytics, Application Insights for each agent, diagnostic settings required by policy, hooks for Purview and DSPM for AI, and Defender for Cloud AI threat protection. |
| Easy to adjust | Connector classification, the list of allowed models, environment settings and policy parameters are all variables, so you can tighten or loosen the rules without redesigning anything. |
