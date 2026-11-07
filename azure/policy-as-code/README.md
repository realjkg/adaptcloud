# Policy as code: AI agent governance

Azure Policy definitions and the `ai-agent-governance` initiative (a set of
policies) that the platform team assigns to the **Application Platform management
group**. This meets the CAF AI agent guidance's requirement that agents be
governed with policy as code.

## Contents

| Path | Purpose |
|---|---|
| `definitions/allowed-ai-locations.json` | Blocks AI, Cognitive Services, Search, AI Foundry, APIM and Key Vault resources outside the approved regions. |
| `definitions/allowed-aoai-model-deployments.json` | Blocks Azure OpenAI and AI Foundry model deployments that aren't on the approved `model.name` list (and, optionally, `model.version`). |
| `definitions/deny-ai-public-network-access.json` | Blocks Cognitive Services accounts (including OpenAI), AI Search, ML and AI Foundry workspaces, Key Vault and Storage when `publicNetworkAccess` is on, so private endpoints are required. |
| `definitions/deny-cognitive-services-local-auth.json` | Blocks Cognitive Services and OpenAI accounts that allow sign-in with keys, so Entra ID is required and every call can be traced to an agent identity. |
| `definitions/audit-managed-identity-on-agents.json` | Flags resources that run AI (Cognitive Services, App Service and Functions, Container Apps, Azure ML online endpoints) that don't have a managed identity. |
| `definitions/require-diagnostic-settings-ai.json` | `deployIfNotExists`: makes sure Cognitive Services, OpenAI, AI Search, ML workspaces and APIM send diagnostics to the central Log Analytics workspace. |
| `definitions/require-agent-resource-tags.json` | `modify`/`deny`: requires the `agentOwner`, `agentPurpose`, `dataClassification` and `expiresOn` tags on resource groups and AI resources. |
| `initiative/ai-agent-governance-initiative.json` | The set that groups all of the above, with sensible default parameters. |
| `initiative/policy_assignments.tf` | Publishes the definitions and the initiative, and assigns the initiative to the Application Platform management group, with a user-assigned identity for the `deployIfNotExists`/`modify` effects. |

## Deploy

```bash
cd azure/policy-as-code/initiative
terraform init
terraform apply \
  -var "management_group_id=/providers/Microsoft.Management/managementGroups/alz-application-platform" \
  -var "central_log_analytics_workspace_id=/subscriptions/.../workspaces/law-application-platform" \
  -var "policy_remediation_identity_id=/subscriptions/.../userAssignedIdentities/id-ai-agent-policy-remediation" \
  -var 'allowed_locations=["eastus2","swedencentral"]' \
  -var 'allowed_aoai_models=[{name="gpt-4o"},{name="gpt-4o-mini"},{name="text-embedding-3-large"}]'
```

(Or pass the values straight from the landing-zone module's `landing_zone_summary` output.)

## Easy to adjust

`allowed_locations`, `allowed_aoai_models`, the list of required tags and where
diagnostics go are all initiative parameters. To tighten or loosen the rules,
change the assignment, not the code. For a real emergency, add an
`azurerm_management_group_policy_exemption`.
