# Quickstart: set it up in the portal

This guide gets a **governed insurance agent** running by clicking through the
portals, in the same order as the Terraform under `azure/`. Each step names the
infrastructure-as-code file it matches, so you can switch from manual setup to
code later: either `terraform import` what you built, or rebuild it in a
non-production subscription and retire the hand-built one.

None of this should go straight to production: review it, set your own values,
and run it through your own pipeline first.

> **The least you need on day one to demo a governed agent:** steps 1, 2 (only
> some of the policies), 3 and 4. Add steps 5–7 afterward.

---

## 1. Set up the Application Platform landing zone (Azure portal)

> Maps to `azure/landing-zones/application-platform/` (`management-group.tf`,
> `subscription-vending.tf`, `main.tf`).

1. **Management groups** (`portal.azure.com` → *Management groups*) → if you
   don't already have an **Application Platform** management group, **+ Create**
   one named `alz-application-platform` under your platform's "Landing Zones"
   management group (or under the tenant root if you don't have management groups
   yet). *This is the step that creates an Application Platform landing zone if
   you don't have one.*
2. Move (or create) the **`insurance-app` subscription** and place it under
   `alz-application-platform` (*Subscriptions* → pick subscription → *Move* →
   target = the new management group; or *+ Add* a new subscription).
3. In that subscription, create three resource groups in a region you allow
   (for example **East US 2**): `rg-insurance-app-workload`,
   `rg-insurance-app-ai`, `rg-insurance-app-identity`.
4. *(Optional for now; you can do it later with `networking.tf`.)* Create a spoke
   VNet with the subnets `snet-privateendpoints`, `snet-powerplatform` (delegated
   to `Microsoft.PowerPlatform/enterprisePolicies`) and `snet-apim`, connected to
   your network hub. You can start without VNet injection or private endpoints and
   add them before production.

---

## 2. Policy as code (Azure portal → Policy)

> Maps to `azure/policy-as-code/` (`definitions/*.json`,
> `initiative/ai-agent-governance-initiative.json`, `initiative/policy_assignments.tf`).

1. **Policy → Definitions → + Policy definition** → set *Definition location* =
   `alz-application-platform` → paste the contents of each file in
   `azure/policy-as-code/definitions/*.json` (the whole object — the portal reads
   the `properties` block) → *Save*. Repeat for all seven.
2. **Policy → Definitions → + Initiative definition** → location =
   `alz-application-platform` → *Add policy definition(s)* → add the seven you
   just created → on the *Initiative parameters* tab expose `allowedLocations`,
   `allowedModelNames`, `requiredTagNames`, `logAnalyticsWorkspaceId` → set the
   `effect` group values (Deny / Audit / DeployIfNotExists per the file
   comments) → *Save*.
3. **Policy → Assignments → Assign initiative** → *Scope* =
   `alz-application-platform` → pick the initiative → on *Remediation*, choose
   **Create a system-assigned managed identity** (the portal grants it the role
   needed for the `DeployIfNotExists` diagnostics policy) → set the parameter
   values (your regions, approved model names, the Log Analytics workspace ID
   from step 7) → *Review + create*.
4. **A faster way you can repeat:** open **Cloud Shell** from the portal and run
   the Terraform in `azure/policy-as-code/initiative/`. It publishes the
   definitions, builds the initiative and assigns it with the platform's
   remediation identity. Or run `az policy definition create … && az policy
   set-definition create … && az policy assignment create …`.

> To move fast on day one, assign at least *allowed-ai-locations*,
> *deny-ai-public-network-access* and *require-agent-resource-tags*. Add the rest
> once the AI services exist.

---

## 3. Low-code platform (Power Platform admin center, `admin.powerplatform.microsoft.com`)

> Maps to `azure/workloads/insurance-app/power-platform.tf` and `dlp-policy.tf`.
> The connector lists are in `variables.tf` → `business_connectors` /
> `non_business_connectors` / `blocked_connectors`.

1. **Environments → + New** → create `insurance-dev` (*Type* = Sandbox, **Add a
   Dataverse data store** = Yes). Repeat for `insurance-test` (Sandbox) and
   `insurance-prod` (Production).
2. For each environment: select it → **Edit Managed Environment** → toggle it
   **On** → *Sharing* limit makers to **20** users per app → *Solution checker*
   = **Block** (block publish on errors) → *Usage insights* = **On (weekly)** →
   add the maker onboarding note. *(IP firewall: once the network exists, limit
   it to the spoke and APIM outbound address ranges.)*
3. **Policies → Data policies → + New policy** → name
   *"Insurance agent platform – connector governance"*:
   - **Business**: the certified or Microsoft-published connectors the apps may
     use: Dataverse, SharePoint, Outlook (Office 365), Office 365 Users, Teams,
     OneDrive for Business, SQL Server, Azure Blob, Azure Queues, Service Bus,
     Event Hubs, **Azure OpenAI**, Text Analytics, Computer Vision, **Document
     Intelligence (Form Recognizer)**, AI Builder, Dynamics 365 Business Central,
     Salesforce, **DocuSign**, **Adobe Acrobat Sign**, Approvals, Excel Online
     (Business), Word Online (Business), Power BI, Azure Automation.
   - **Non-Business**: low-risk general connectors (RSS, MSN Weather, Bing Maps).
   - **Blocked**: X/Twitter, Facebook, Instagram, YouTube, Dropbox, Box, Google
     Drive, Gmail, consumer OneDrive, SMTP "send mail", HTTP-with-Azure-AD/HTTP,
     and **non-Azure OpenAI**.
   - **Custom connectors** → set a connector pattern that **allows only**
     `https://apim-insurance-app.azure-api.net/*` and **blocks `*`**, so makers
     can't build their own connector outside these rules.
   - **Scope** = these environments → `insurance-dev/test/prod`.
4. **Settings → Tenant settings** → restrict who can create production / trial /
   developer environments, and turn off maker features you don't need.
   *(Optional: install the **Power Platform CoE Starter Kit** to get the live
   list of agents and apps that the governance doc refers to.)*

---

## 4. Create the agent and its identity (Copilot Studio, `copilotstudio.microsoft.com`)

> Maps to `azure/workloads/insurance-app/identity-agents.tf` (one identity per
> agent, the `ai-agents` group and the Conditional Access note).

1. Switch to the **`insurance-dev`** environment → **+ Create / New agent** →
   e.g. `claims-triage-agent`. Because the environment is a **Managed
   Environment**, when you publish the agent it is automatically issued a
   **Microsoft Entra Agent ID**. That's its own identity, which you can secure,
   trace and govern, with no client secret.
2. Configure the agent:
   - **Settings → Security → Authentication** = *Authenticate with Microsoft*
     (Microsoft Entra ID).
   - **Knowledge** = only approved sources (the SharePoint sites and Dataverse
     tables you've signed off on).
   - **Topics / Actions** for sensitive operations (binding a quote, authorizing a
     payout) → require **confirmation**, so a person approves each one.
   - **Actions / Tools** → connect only through the Business connectors and your
     APIM custom connector from step 6.
3. **Entra admin center** (`entra.microsoft.com`):
   - **Identity → Groups → + New group** → security group **`ai-agents`** → add
     the agent's identity (and any user-assigned managed identities from the AI
     services) as members. This group is both your list of agents and what
     Conditional Access targets.
   - **Identity → Applications → Agent ID** (preview): check that the agent shows
     up here, and set an **owner**.
   - **Protection → Conditional Access → + New policy** → *Assignments* target
     **Workload identities** = the `ai-agents` group → *Conditions*: block
     legacy authentication; *Locations*: allow only your named locations (the
     spoke and APIM outbound IPs) → *Grant*: Block otherwise. *(Conditional Access
     for workload identities needs the Microsoft Entra Workload ID add-on.)*
   - **Identity Governance → Access reviews → + New** → a review of the
     `ai-agents` group every quarter. Disable, then delete, any agent with no
     owner or past the date in its `expiresOn` tag.

---

## 5. AI services, for agents that use your data or are written in code (Azure AI Foundry portal, `ai.azure.com`)

> Maps to `azure/workloads/insurance-app/ai-foundry.tf`,
> `key-vault.tf`, `networking.tf`.

1. **+ New hub** in `rg-insurance-app-ai` → attach a Storage account and a Key
   Vault → set **Public network access = Disabled** → then **+ New project** in
   that hub (`proj-insurance-agents`).
2. **Deployments → + Deploy model** → deploy *only* the approved models:
   `gpt-4o`, `gpt-4o-mini`, `text-embedding-3-large`. The
   *allowed-aoai-model-deployments* policy blocks anything else.
3. Add **Azure AI Search** (`srch-insurance-app`, with public access and local
   sign-in turned off) so agents can answer from your data, and an **Azure AI
   Content Safety** resource. Turn on **Prompt Shields** and create a default
   blocklist.
4. **Private endpoints** (portal → each resource → *Networking → Private
   endpoint connections → + Private endpoint*) into `snet-privateendpoints` for
   the Azure OpenAI account, AI Search, Content Safety, the AI Foundry hub, the
   storage account and Key Vault. Turn off public access on each.
5. **Microsoft Defender for Cloud** → *Environment settings* → the
   `insurance-app` subscription → turn on the **AI workloads** plan (it detects
   prompt injection and unusual use), plus the **Key Vault** and **ARM** plans.
6. Give each agent's **user-assigned managed identity** (from `identity-agents.tf`,
   or create them under `rg-insurance-app-identity` in *Managed Identities*) only
   these roles, each limited to one resource: *Cognitive Services OpenAI User* on the Azure OpenAI account,
   *Search Index Data Reader* on AI Search, *Key Vault Secrets User* on the
   vault, *Monitoring Metrics Publisher* on its App Insights.

---

## 6. API connectors (Azure portal → API Management)

> Maps to `azure/workloads/insurance-app/connectors-apim.tf` and the OpenAPI
> specs in `azure/workloads/insurance-app/connectors/`.

1. **Create a resource → API Management** in `rg-insurance-app-workload`
   (start with the Developer tier; switch to **Internal VNet** mode on
   `snet-apim` when the spoke is ready). Turn on its **system-assigned identity**
   and give it **Key Vault Secrets User** on the workload vault.
2. **APIs → + Add API → OpenAPI** → upload
   `connectors/insurance-policy-api.openapi.yaml`, then `connectors/claims-api.openapi.yaml`.
3. On each API → **Design → All operations → Inbound processing → </> (code
   view)** → add a `validate-azure-ad-token` policy (and a `rate-limit`), so every
   call must carry a valid Entra ID token. Agents call APIM with their managed
   identity or Entra Agent ID, never an API key.
4. On each API → **… → Export → Power Platform** (Power Automate / Power Apps) →
   choose the `insurance-dev` environment. This publishes the API as a
   **custom connector** that follows the rules. Because of the DLP rule from
   step 3, this connector (host = `apim-insurance-app.azure-api.net`) is allowed
   and no other custom connector is.
5. **APIM → Monitoring → Diagnostic settings** → stream `GatewayLogs` to the
   central Log Analytics workspace. (The *require-diagnostic-settings* policy also
   sets this up for you if it's missing.)

---

## 7. Monitoring (Azure portal and Purview)

> Maps to `azure/landing-zones/application-platform/monitoring.tf` and
> `azure/workloads/insurance-app/observability.tf`.

1. **Create a Log Analytics workspace** `law-application-platform` (or reuse the
   platform one) → **Microsoft Sentinel → + Add** onto that workspace.
2. For each agent: **Create → Application Insights** → *Workspace-based*, pointed
   at `law-application-platform`; tag it `agentName=<agent>`. Add the
   connection string to the Copilot Studio agent's analytics, or to your agent's
   code.
3. **Diagnostic settings** on the Azure OpenAI account, AI Search, Content
   Safety, Key Vault, and APIM → send all logs/metrics to
   `law-application-platform`. (Policy requires this anyway; doing it now just
   saves waiting for policy to catch up.)
4. **Microsoft Purview / Compliance portal** → turn on **Audit** → enable **DSPM
   for AI** → register the AI Foundry project and the agents' knowledge sources
   as data sources → apply sensitivity labels, so prompts and responses, data
   access and agent actions are recorded and respect those labels.

---

## Moving from the portal to code

| Portal step | IaC to adopt next |
|---|---|
| 1 | `azure/landing-zones/application-platform/` (`terraform import` the management group and the subscription's place in it, or rebuild in a non-production subscription) |
| 2 | `azure/policy-as-code/` (definitions + initiative + assignment) |
| 3 | `azure/workloads/insurance-app/power-platform.tf`, `dlp-policy.tf` |
| 4 | `azure/workloads/insurance-app/identity-agents.tf` (+ keep the Conditional Access policy in your identity-governance pipeline) |
| 5 | `azure/workloads/insurance-app/ai-foundry.tf`, `key-vault.tf`, `networking.tf` |
| 6 | `azure/workloads/insurance-app/connectors-apim.tf` (+ the `connectors/*.openapi.yaml` specs) |
| 7 | `azure/landing-zones/application-platform/monitoring.tf`, `azure/workloads/insurance-app/observability.tf` |

See `azure/docs/caf-ai-agent-governance-mapping.md` for how each control maps to
the Microsoft CAF "Govern and secure AI agents across your organization"
guidance.
