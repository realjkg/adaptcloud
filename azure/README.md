# Adapt Cloud — Insurance Agent Platform on Azure

Infrastructure-as-code for an **insurance application** built **low-code first**
(Power Platform + Copilot Studio) and progressively layered with **API
connectors**, deployed inside an **Azure Landing Zone (ALZ)** with **policy as
code** governance.

This directory is the implementation of the Microsoft Cloud Adoption Framework
guidance **"Govern and secure AI agents across your organization"**
(<https://learn.microsoft.com/azure/cloud-adoption-framework/ai-agents/governance-security-across-organization>)
and the AI landing zone / Application landing zone guidance.

## Why this layout

The CAF says: agents are a **new identity class**, they must run inside an
**Application (workload) landing zone** that sits under an **Application Platform
management group**, and their guardrails must be **policy as code**. If your
tenant does not already have an Application Platform landing zone, you must
create one before onboarding agent workloads — so we do.

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

> **Just want to get started clicking?** See [`QUICKSTART-portal.md`](QUICKSTART-portal.md)
> for the portal-only path (Azure portal + Power Platform admin center + Copilot
> Studio + AI Foundry), step-by-step, mapped back to each Terraform file.
>
> **Cost & teardown?** See [`COSTS.md`](COSTS.md). Ready-made variable sets — a
> ~$80–150/mo demo and a production posture — are in [`profiles/`](profiles/).

## Build / deploy order

1. **Platform team** — `landing-zones/application-platform/` (idempotent: creates
   the Application Platform MG and supporting subscription only if absent).
2. **Platform team** — `policy-as-code/` (publishes definitions + the
   `ai-agent-governance` initiative and assigns it at the Application Platform MG).
3. **Workload team** — `workloads/insurance-app/` (low-code environment first;
   connectors and AI Foundry agents layered on top, all behind the policy guardrails).

Each directory has its own `README.md`, `providers.tf`, `variables.tf`, and
`terraform.tfvars.example`. Nothing here is meant to go straight to production —
review, parameterize, and run through your own pipeline first.

## Sandbox quickstart (dev-demo)

The cheapest way to actually exercise the use case. Uses the
[`profiles/dev-demo`](profiles/) posture (~$80–150/mo: public endpoints,
Consumption APIM, Basic AI Search, one Power Platform sandbox, one agent). **Demo
data only** — public endpoints mean the network-isolation guardrails are off.

### Prerequisites

- **Terraform ≥ 1.6** and **Azure CLI** — `az login` then `az account set --subscription <sandbox-sub-id>`.
- Providers are pulled on `terraform init`: `azurerm` ~4, `azuread` ~3, `azapi` ~2, `microsoft/power-platform` ~3.
- **Permissions** in the sandbox subscription:
  - **Owner** *and* **User Access Administrator** (the modules create RBAC role assignments).
  - Entra: rights to create **app registrations** + a **security group** (Application Administrator / Application Developer).
  - Full-stack path only: **Management Group Contributor** + **Resource Policy Contributor** at the MG scope.
- **Power Platform**: the signed-in principal must be a **Power Platform Service Admin** (the provider uses `use_cli = true`), and the tenant needs available **Dataverse capacity** to create the environment. No capacity? See the caveat below.

### Path A — workload only (fastest; skips landing zone + policy)

Deploy just the agent workload into an existing sandbox subscription. Pre-create
(or reuse) a **Log Analytics workspace** and an **Entra security group** (can be
empty) and grab their IDs.

```bash
cd azure/workloads/insurance-app
terraform init
terraform apply \
  -var-file=../../profiles/dev-demo/insurance-app.tfvars \
  -var insurance_subscription_id=<sandbox-sub-id> \
  -var central_log_analytics_workspace_id=<existing-law-resource-id> \
  -var ai_agents_group_object_id=<existing-group-object-id>
```

No VNet, no private endpoints, Consumption APIM, Basic AI Search, one Power
Platform sandbox env, one agent identity.

> **No Power Platform capacity (or you only want the Azure AI plane)?** Add
> `-var enable_power_platform=false`. That skips the Dataverse environments,
> Managed Environments, environment settings, DLP policies, and the VNet
> enterprise policy — the Azure AI plane (OpenAI/Search/Content Safety/AI
> Foundry), APIM, Key Vault, agent identities, and observability still deploy.

### Path B — full stack with governance

1. `landing-zones/application-platform` with `-var-file=../../profiles/dev-demo/application-platform.tfvars` (+ your real IDs).
2. `policy-as-code/initiative` — **assign with `-var enforcement_mode=DoNotEnforce`.**
   **IMPORTANT:** the dev-demo workload uses **public endpoints**; if you assign the
   initiative in its default **Deny** mode, the `deny-ai-public-network-access`
   (and `deny-cognitive-services-local-auth`) policies will **block the workload
   apply**. `DoNotEnforce` still evaluates compliance (so you see what *would*
   fail) without blocking. Switch to `Default` once you move to the `prod`
   profile (private endpoints).
3. `workloads/insurance-app` with the dev-demo profile, feeding the landing-zone
   outputs (`spoke_subnet_ids`, `central_log_analytics_workspace_id`,
   `ai_agents_group_object_id`).

### Verify

- `terraform output workload_summary` and `terraform output agent_identities`.
- Azure portal: the Azure OpenAI account + the two model deployments, Key Vault, per-agent Application Insights.
- Power Platform admin center: the `insurance-demo` **Managed Environment** + the connector **DLP policy**.
- Copilot Studio: create an agent in `insurance-demo` — it gets an **Entra Agent ID**; confirm it lands in the `ai-agents` group in Entra. (Walkthrough: [`QUICKSTART-portal.md`](QUICKSTART-portal.md) step 4.)

### Tear down

```bash
terraform destroy   # same -var-file / -var flags as apply
```

With the dev-demo profile (`key_vault_purge_protection = false`, Consumption
APIM, Basic AI Search) nothing lingers or blocks a rebuild. Full teardown
gotchas (purge protection, soft-delete) are in [`COSTS.md`](COSTS.md).

## Design principles (from the CAF article)

| Principle | How it shows up here |
|---|---|
| Agents are first-class identities | Every agent gets a dedicated **Entra Agent ID** (Copilot Studio / AI Foundry) or **user-assigned managed identity**; no shared identities, no human impersonation, no secrets in code. See `workloads/insurance-app/identity-agents.tf`. |
| Least privilege | Scoped RBAC role assignments + scoped connector permissions + Conditional Access targeting agent identities. |
| Run inside a landing zone | The workload is a vended **Application landing zone** subscription peered to the connectivity hub; PaaS is private-endpoint only. |
| Policy as code | `policy-as-code/` — allowed regions, approved models, deny public network access, require diagnostic settings, require ownership/classification tags, audit managed identity / disable local auth. |
| Low-code first, widest connector reach | Power Platform **managed environment** + **DLP policy** classifying the full connector catalog into Business / Non-Business / Blocked; custom **API connectors** generated from OpenAPI specs in `workloads/insurance-app/connectors/`. |
| Traceable / observable | Central Log Analytics, Application Insights per agent, diagnostic settings enforced by policy, Purview/DSPM-for-AI hooks, Defender for Cloud AI threat protection. |
| Adaptive & flexible | Connector classification, model allow-lists, environment settings, and policy parameters are all variables — change governance posture without re-architecting. |
