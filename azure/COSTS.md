# Cost and teardown

Rough monthly costs for the insurance agent platform. **These are list prices in
USD, pay-as-you-go, in East US 2, with no enterprise (EA) or partner (CSP)
discount, at early-2026 rates. Always check the
[Azure Pricing Calculator](https://azure.com/e/) before you commit.** Power
Platform and Copilot Studio are paid through **licenses and capacity**, not Azure
usage, so they're covered separately below.

Two ready-made sets of variables are in [`profiles/`](profiles/): `dev-demo` and
`prod`. The module defaults fall between them.

| | `profiles/dev-demo` | module defaults | `profiles/prod` |
|---|---|---|---|
| Idle Azure cost / month | **~$80–150** | ~$600–750 | **~$3,500–6,000+** |
| Private endpoints | off (public) | on | on |
| VNet injection / APIM mode | off / external | off / external (APIM Developer) | on / **Internal** |
| API Management SKU | `Consumption_0` (serverless) | `Developer_1` (~$50) | `Premium_1` (~$2,800/unit) |
| AI Search | `basic`, 1×1 (~$75) | `standard`, 1×2 (~$490) | `standard`, 1×3 (~$735) |
| Power Platform environments | 1 sandbox | 3 | 3 (dev/test/prod) |
| Agents (identities) | 1 | 4 | 4 |
| Log Analytics retention | 30 d | 90 d | 90 d |
| Defender for Cloud AI plan | off | on | on |
| Key Vault purge protection | off | on | on |
| Governance policies | run in **Audit** | enforced | enforced |

> The demo profile uses **public endpoints**. That's acceptable only for demo data
> that isn't sensitive, with the `ai-agent-governance` initiative assigned in
> **Audit** mode.

## Where the money goes

| Component | Pricing model | ~Idle / month | Notes & knobs |
|---|---|---|---|
| **Azure AI Search** | per *search unit* (replicas × partitions) × tier hourly rate; billed while the service exists, idle or not | `free` $0 · `basic` ~$75 · `standard` (S1) ~$245/unit | Biggest fixed line at the defaults (2 units ≈ $490). Knobs: `ai_search_sku`, `ai_search_replica_count`, `ai_search_partition_count`. `free` = no SLA, 3 indexes — fine for a demo. |
| **API Management** | per gateway unit, hourly (or per-call for Consumption) | `Consumption_0` ~$0 + ~$3.50 / 1M calls · `Developer_1` ~$50 (no SLA) · `StandardV2_1` ~$700 (VNet) · `Premium_1` ~$2,800/unit (Internal VNet + zones) | Knob: `apim_sku_name`. Consumption can't do Internal VNet — pair with `enable_vnet_injection=false`. Premium is the jump that takes you to four figures. |
| **Private endpoints** | ~$0.013/hr each (~$9.50/mo) + ~$0.01/GB processed | ~$45–65 (≈6–7 PEs) | Knob: `enable_private_endpoints` (off ⇒ no PEs, public access on). |
| **Log Analytics + Microsoft Sentinel** | per GB ingested (~$2.30–2.76/GB after 5 GB free) + Sentinel ~$2.46/GB + retention >31 d (~$0.12/GB/mo) | ~$10–80 | Scales with how chatty diagnostic settings are. Knob: `log_analytics_retention_days`; reuse the platform workspace via `central_log_analytics_workspace_id`. |
| **Defender for Cloud** (ARM + Key Vault + AI workloads plans) | ARM ~$4–5/sub · Key Vault ~$0.02/10K txns · AI plan metered | ~$10–30 | Knob: `enable_defender_ai_threat_protection`; the ARM + Key Vault plans are always set by the workload module. |
| **Azure OpenAI** (account is free) | per 1K/1M tokens | **$0 idle → variable** | `capacity` in `approved_model_deployments` is TPM *quota*, not a reservation — unused costs nothing. gpt-4o ≈ $2.50 / $10 per 1M in/out · gpt-4o-mini ≈ $0.15 / $0.60 · text-embedding-3-large ≈ $0.13 per 1M. (Provisioned throughput "PTU" would be a fixed hourly charge — not used here; deployments are `Standard` = PAYG.) |
| **Azure AI Content Safety** | per 1K records | $0 idle → ~$0.75 / 1K text records | Metered only. |
| **AI Foundry hub + project** | free (it's an Azure ML workspace) — you pay for attached storage/KV/ACR and any compute | ~$0 (no compute provisioned) | Add compute clusters/online endpoints and they bill separately. |
| **Application Insights** (per agent + APIM) | workspace-based ⇒ ingestion billed via Log Analytics above | components free | Included in the LAW line. |
| **Key Vault** (Standard) | ~$0.03 per 10K operations | ~$1–3 | Knob: `key_vault_purge_protection` (affects teardown, not cost — see below). |
| **Storage** (ZRS, Standard) | per GB + transactions | ~$1–5 | AI Foundry's backing store; grows with artifacts. |
| **Networking** (VNet, peering, route table, NSGs) | VNet/RT free; peering ~$0.01/GB each way | ~$1–10 | |
| **Management groups, policy assignments, managed identities, Entra apps/groups, budgets** | free | $0 | |
| **Power Platform / Copilot Studio** | licensing & capacity | **$0 if entitled, else $$$** | Each *production* Dataverse env needs ~1 GB DB drawn from tenant capacity (overage ~$40/GB/mo). Managed Environments require premium Power Platform per-user (~$5–20/user/mo) or per-app plans. **Copilot Studio** runs on a Copilot Studio license **or message packs (~$200/mo per 25K messages)**. Sandbox envs are cheaper / no min DB. |

**Bottom line at the module defaults:** about $600–750 a month on the Azure side
(mostly AI Search, APIM and private endpoints), **plus** model token usage,
**plus** Power Platform and Copilot Studio licenses.

### The five settings that change the cost most
1. `apim_sku_name` — `Developer_1` (~$50) vs `Premium_1` (~$2,800/unit).
2. `ai_search_sku` + `ai_search_replica_count` — `basic` 1×1 (~$75) vs `standard` 1×3 (~$735).
3. `enable_private_endpoints` — turning it off saves ~$50/mo, but you lose network isolation.
4. `log_analytics_retention_days`, and reusing the platform's workspace.
5. How many `power_platform_environments` and `agents` you create (mostly a license and quota question, not Azure spend).

## Can you tear it down whenever you want?

**Yes.** Run `terraform destroy` in each module, in reverse order:
`workloads/insurance-app` → `policy-as-code/initiative` → `landing-zones/application-platform`.
(Deny policies block *creating and updating*, not *deleting*, so the order only
keeps things tidy.) Things to know:

- **What actually stops the charges:** AI Search and API Management cost money
  *as long as they exist*, even when idle, so delete those first if you just want
  billing to stop quickly. OpenAI and Content Safety stop costing anything as soon
  as you stop calling them.
- **Key Vault doesn't fully disappear if `key_vault_purge_protection = true`.** It
  stays soft-deleted for 90 days and **can't be purged early**, so you can't reuse
  the name for 90 days. The `dev-demo` profile sets it to `false` (7-day soft
  delete, and you can purge it) so you can rebuild. To purge a soft-deleted vault:
  `az keyvault purge --name <kv> --location <region>` (this works only if purge
  protection was off).
- **Cognitive Services** (Azure OpenAI, Content Safety) and **API Management**
  are also soft-deleted at first (for about 48 hours). Purge them to free the
  name right away:
  `az cognitiveservices account purge -g <rg> -n <acct> -l <region>` /
  `az apim deletedservice purge --service-name <apim> --location <region>`, or
  just use new names when you redeploy. Deleting APIM Developer takes about
  5–15 minutes; Premium can take 30–45.
- **Power Platform environments** are deleted along with their Dataverse data. A
  Power Platform admin can restore an environment for about 7 days; after that
  it's gone. The DLP policies are removed too. Note that the **tenant baseline
  DLP** policy applies to the whole tenant.
- **The Application Platform management group** is deleted only if the workload
  module *created* it (`create_application_platform_mg = true`) and it's empty.
  If it already existed and Terraform only looked it up, nothing happens. The
  subscription is just removed from the management group; Terraform does **not**
  delete the subscription itself. If Terraform created the subscription for you,
  it's *canceled* (with its own ~90-day window), not deleted.
- **`DeployIfNotExists` leftovers:** removing the policy assignment doesn't remove
  the diagnostic settings it added to resources. That doesn't matter if you're
  deleting those resources anyway.
- **Agents created in the portal aren't in Terraform state.** If you made a
  Copilot Studio agent by hand, delete it in Copilot Studio, along with its Entra
  Agent ID; `terraform destroy` won't.
- **Defender for Cloud plans** go back to the Free tier when you destroy, so they leave no ongoing cost.
- **Soft-deleted resources stop you from redeploying with the same names.** Purge
  them (see above) or use new names.

### Cheapest way to create, demo and delete
Use `profiles/dev-demo` (public endpoints, `Consumption_0` APIM, `basic` or `free`
search, `key_vault_purge_protection=false`, a throwaway management group name).
`terraform apply` → demo → `terraform destroy`. With purge protection off and the
Consumption APIM SKU, nothing is left behind and nothing blocks an immediate
rebuild.
