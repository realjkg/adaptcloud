# Running the end-to-end test

`run-e2e.sh` deploys the whole sandbox, tests it and tears it down, all with one
command. Each numbered step checks one of the platform's claims (see
[`../README.md`](../README.md)), and the script stops with a clear error at the
first step that fails.

## Before you start

- Terraform ≥ 1.6 on PATH
- Python 3.11+ with `pip install -r ../requirements.txt`
- Azure CLI (`az login`, or OIDC federation in CI)
- A sandbox subscription you **already have**, plus:
  - `LAW_ID` — the resource ID of any Log Analytics workspace
  - `AI_AGENTS_GROUP` — the object ID of any Entra security group (it can be empty)

## Environment variables

| Var | Meaning |
|---|---|
| `AZURE_SUBSCRIPTION_ID` | workload sandbox subscription id |
| `LAW_ID` | existing Log Analytics workspace resource id |
| `AI_AGENTS_GROUP` | existing Entra security group object id |
| `APIM_ENTRA_SCOPE` | `api://insurance-app-connectors/.default` (default) |
| `AZURE_OPENAI_DEPLOYMENT` | `gpt-4o-mini` (default) |
| `AGENT_HTTP_ENDPOINT` | *(optional)* enables the observability trace test |

## Cost note

One full run, with `enable_power_platform=false`, Consumption APIM, Basic AI
Search and `gpt-4o-mini` for the evaluations, costs about $1–2 in Azure charges
plus around $0.10 in OpenAI tokens. The `terraform destroy` at the end runs even
if a step fails (a bash trap makes sure of it), so nothing is left behind.

## Run

```bash
AZURE_SUBSCRIPTION_ID=... LAW_ID=... AI_AGENTS_GROUP=... bash run-e2e.sh
```
