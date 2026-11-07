# Deployment profiles

Two ready-made sets of variables: one keeps cost low, the other is ready for
production. See [`../COSTS.md`](../COSTS.md) for the full breakdown.

| Profile | Rough Azure cost (idle) | Settings |
|---|---|---|
| `dev-demo/` | **~$80–150 / month** | Public endpoints, no VNet, AI Search Basic 1×1, APIM Developer, one Power Platform environment, 1 agent, Log Analytics 30-day retention, Defender AI plan off, Key Vault purge protection off. Run the governance policies in **Audit** mode and use **only data that isn't sensitive**. |
| `prod/` | **~$3,500–6,000+ / month** | Private endpoints and APIM inside the VNet (Premium, across availability zones), AI Search Standard 1×3, dev/test/prod environments, all four agents, 90-day retention, Defender AI plan on, Key Vault purge protection on, policies in **Deny/DeployIfNotExists** (enforced). |

The modules' built-in defaults fall **between** these (private endpoints on,
AI Search Standard 1×2, APIM Developer, three environments), at roughly
$600–750/month idle.

## How to use

Each profile has two files, one for each Terraform module:

```bash
# 1) Application Platform landing zone
cd azure/landing-zones/application-platform
terraform apply \
  -var-file=../../profiles/prod/application-platform.tfvars \
  -var-file=ids.tfvars            # your real subscription/tenant/hub IDs (gitignored)

# 2) Policy as code (no profile needed; pass the landing-zone outputs)
cd ../../policy-as-code/initiative
terraform apply -var management_group_id=... -var central_log_analytics_workspace_id=... -var policy_remediation_identity_id=...

# 3) Insurance workload
cd ../../workloads/insurance-app
terraform apply \
  -var-file=../../profiles/prod/insurance-app.tfvars \
  -var-file=ids.tfvars
```

> The `*_subscription_id` / `tenant_*` / `hub_*` values in these profile files
> are **placeholders**. Put your real IDs in a separate, gitignored `ids.tfvars`
> (or in `-var` flags), so the profile stays a set of settings you can share.

## Switching from demo to prod

Going from `dev-demo` to `prod` changes `enable_private_endpoints`, `enable_vnet_injection`,
`apim_sku_name`, `ai_search_sku`/replicas/partitions, `key_vault_purge_protection`,
the set of `power_platform_environments` and `agents`, `log_analytics_retention_days`,
and `enable_defender_ai_threat_protection`. Changing the AI Search SKU or replicas
or the APIM SKU, or turning private endpoints or VNet injection on or off, means
the resources are **deleted and created again**. Plan a maintenance window, or
better, build the prod stack in its own subscription, move over, and then tear
down the demo (see `../COSTS.md`).
