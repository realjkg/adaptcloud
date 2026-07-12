# E2E orchestration

`run-e2e.sh` is the single-command runner that deploys, exercises, and tears
down the full sandbox. Each numbered step maps to one architecture pillar
(see [`../README.md`](../README.md)); the script fails loudly on the first
red step.

## Prereqs

- Terraform ≥ 1.6 on PATH
- Python 3.11+ with `pip install -r ../requirements.txt`
- Azure CLI (`az login`, or OIDC federation in CI)
- **Existing** sandbox subscription and:
  - `LAW_ID` — a Log Analytics workspace resource id (any)
  - `AI_AGENTS_GROUP` — an Entra security group object id (any; can be empty)

## Env vars

| Var | Meaning |
|---|---|
| `AZURE_SUBSCRIPTION_ID` | workload sandbox subscription id |
| `LAW_ID` | existing Log Analytics workspace resource id |
| `AI_AGENTS_GROUP` | existing Entra security group object id |
| `APIM_ENTRA_SCOPE` | `api://insurance-app-connectors/.default` (default) |
| `AZURE_OPENAI_DEPLOYMENT` | `gpt-4o-mini` (default) |
| `AGENT_HTTP_ENDPOINT` | *(optional)* enables the observability trace test |

## Cost note

One full run — with `enable_power_platform=false`, Consumption APIM, Basic AI
Search, `gpt-4o-mini` for the evaluations — is ~$1-2 in Azure charges plus
maybe $0.10 in OpenAI tokens. The `terraform destroy` at the end (also
guaranteed via a bash trap) means nothing lingers.

## Run

```bash
AZURE_SUBSCRIPTION_ID=... LAW_ID=... AI_AGENTS_GROUP=... bash run-e2e.sh
```
