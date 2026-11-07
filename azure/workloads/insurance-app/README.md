# Insurance agent platform: workload landing zone

The insurance application. It's **built with low-code tools first** (Power
Platform and Copilot Studio) and connected to APIs over time. It runs inside the
`insurance-app` application landing zone that
`../../landing-zones/application-platform/` creates.

This is where the agents live. Everything here is covered by the
`ai-agent-governance` policy initiative, so the rules apply from the start:
private endpoints only, approved regions and models only, Entra ID sign-in only,
diagnostics sent to the central workspace, and required owner and classification tags.

## What it creates

| File | Resources |
|---|---|
| `main.tf` | Resource groups, naming and shared tags (including the `agentOwner` / `agentPurpose` / `dataClassification` / `expiresOn` tags that policy requires). |
| `identity-agents.tf` | One identity **per agent**: `policy-intake-agent`, `claims-triage-agent`, `underwriting-copilot`, `fraud-signal-agent`. Each is a user-assigned managed identity (for its tools and back end on Azure) **and** an Entra app registration for the Copilot Studio agent's **Entra Agent ID**. No client secrets, and each role is limited to what the agent needs. All are added to the `ai-agents` group, which Conditional Access targets. The CI/CD pipeline signs in with workload identity federation. |
| `key-vault.tf` | The workload's Key Vault: access through Azure roles, purge protection, **public access off** and a private endpoint. It holds the few secrets that can't be avoided (for example partner API keys, used only through APIM). |
| `power-platform.tf` | Three Dataverse environments (`insurance-dev/test/prod`), each made a **Managed Environment** (limits on how widely makers share, Solution Checker required before publishing, weekly usage insights, and an IP firewall limited to the spoke's address ranges). A VNet injection enterprise policy linked to `snet-powerplatform`. |
| `dlp-policy.tf` | A tenant-wide **baseline** DLP policy, plus a DLP policy for these environments that sorts the connector catalog into **Business / Non-Business / Blocked** and allows custom connectors only to the APIM gateway host. |
| `connectors-apim.tf` | An **API Management** instance inside the VNet. It imports the OpenAPI specs in `connectors/` as APIM APIs and publishes them as Power Platform **custom connectors**, which sign in with Entra ID and use a subscription key per agent, kept in Key Vault. Most ready-made connectors come from the Business group in `dlp-policy.tf`; custom insurance APIs come through here. |
| `ai-foundry.tf` | An Azure AI Foundry hub and project; an Azure OpenAI account (key sign-in and public access off) with **only approved model deployments**; a private Azure AI Search service so agents can answer from your data; and an **Azure AI Content Safety** resource with a default blocklist. |
| `observability.tf` | One Application Insights component per agent, sending to the central Log Analytics workspace; diagnostic settings on APIM, OpenAI, Search and Key Vault; and a link to the tenant's Purview account for the AI audit and DSPM for AI connector. |
| `networking.tf` | Private endpoints (in `snet-privateendpoints`) for OpenAI, AI Search, Key Vault, Storage, AI Foundry and APIM. Nothing can be reached from the public internet. |
| `connectors/*.openapi.yaml` | Sample custom insurance API specs (`insurance-policy-api`, `claims-api`) that `connectors-apim.tf` imports. |

## From low-code to API connectors, step by step

1. **Day 1: low-code.** Makers build the claims and underwriting apps and Copilot
   Studio agents in `insurance-dev` with the **Business** connector group
   (Dataverse, SharePoint, Outlook, Teams, SQL, Azure Blob, Service Bus, Azure
   OpenAI, AI Builder, DocuSign/Adobe Sign, Salesforce, Dynamics 365, …). The
   DLP policy and Managed Environment settings already apply, so nothing risky
   can be connected.
2. **Later: custom APIs.** The policy administration, rating and core claims APIs
   are published behind APIM (`connectors-apim.tf`) and offered as custom
   connectors that follow the rules and sign in with Entra ID. The DLP policy
   allows only custom connectors whose host is the APIM gateway, so makers can't
   build their own outside the rules.
3. **Always: agents are identities.** Each Copilot Studio agent signs in with its
   **Entra Agent ID**, and each of its tools and back ends on Azure uses the
   matching **user-assigned managed identity**. Both are in the `ai-agents` group
   and covered by Conditional Access. Every call is logged and can be traced to
   the agent that made it.

## Releasing changes

Power Platform **pipelines** move solutions through `insurance-dev → test → prod`.
Solution Checker runs every time something is published (a Managed Environment
feature). Connector definitions, environment settings and DLP policies are all in
this Terraform; the apps and agents themselves are in solution files that the
workload team manages.

## Inputs

See `variables.tf` and `terraform.tfvars.example`. The networking, identity and
logging inputs are meant to be passed straight from the application-platform
module's `landing_zone_summary` output.
