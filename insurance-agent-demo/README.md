# Adapt Cloud — Insurance Agent Demo

The `claims-triage-agent` from `azure/workloads/insurance-app/` as a
**locally runnable, Bede-style stack**: `make setup && make start`, open the
browser, paste an FNOL narrative, see the triage decision. Same shape as the
`homeschool-api/` + `homeschool-tutor/` (Bede) tutor demo — Caddy TLS on 443,
UI on 80, FastAPI on 8000, a Prism mock of the Claims API.

## What this proves

- The insurance agent runs **with an Entra Managed Service Identity** — no API
  keys anywhere in the container. `DefaultAzureCredential` picks up the MI when
  attached in Azure, or your `az login` identity locally.
- The full loop works end-to-end: **user submits FNOL → agent triages → agent
  writes the decision back to the Claims API** — same OpenAPI spec that APIM
  imports in production, served by Prism here.
- Two modes: **local** (offline, free, canned triage) and **azure** (calls your
  deployed AOAI account, ~$0.0002 per triage on `gpt-4o-mini`).

## Layout

```
insurance-agent-demo/
├── Makefile              setup / start / stop / logs / status / health / test-triage
├── docker-compose.yml    caddy + ui + api + prism-mock
├── Caddyfile             TLS via Caddy's local CA; / → ui, /api → api
├── .env.example          MODE, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT
├── api/                  FastAPI service
│   ├── main.py           GET /health, POST /triage
│   ├── core/config.py    pydantic-settings
│   ├── core/ai_client.py Azure OpenAI via DefaultAzureCredential (NO keys)
│   ├── services/triage.py orchestrates: FNOL → model → decision → Claims mock
│   ├── services/claims_client.py Claims API HTTP client
│   └── prompts/triage.md single source-of-truth prompt
└── ui/                   Vite + React + TypeScript
    ├── src/App.tsx       FNOL form + triage card
    └── ...
```

## Cost

| Mode | Idle | Per triage | Notes |
|---|---|---|---|
| `local` | $0 | $0 | Canned keyword heuristics. Runs on a plane. |
| `azure` | $0 (AOAI account is free at rest) | ~$0.0002 on `gpt-4o-mini` | 1,000 demos ≈ $0.20 |

Prism is free. The docker images pull once and cache locally.

## Prerequisites

- **Docker Desktop** (or podman + `podman compose`).
- For `MODE=azure`: your Azure account, with the `azure/workloads/insurance-app/`
  workload deployed (`enable_power_platform=false` is fine — you only need the
  Azure OpenAI account and a `gpt-4o-mini` deployment on it). `az login` before
  `make start` so `DefaultAzureCredential` inside the API container can pick up
  a delegated token from `~/.azure/`.

## Quickstart

```bash
cd insurance-agent-demo
make setup       # creates .env from .env.example (MODE=local by default)
make start       # docker compose up -d --build; ~2 min first time
# open https://localhost  (accept Caddy's local-CA warning once)

make test-triage # curl the API directly and pretty-print the JSON
make logs-api    # watch the API logs
make stop        # docker compose down
```

To flip to real Azure OpenAI:

```bash
# edit .env → MODE=azure, AZURE_OPENAI_ENDPOINT=https://aoai-insurance-app-XXXX.openai.azure.com
az login
make restart
```

Every response includes `"mode": "local"` or `"mode": "azure"` so you can tell
at a glance which path a given call took.

## The MSI story

In Azure, run this stack on Container Apps / App Service / AKS with a
**user-assigned managed identity** attached — the same one the workload module
provisions for the agent in `azure/workloads/insurance-app/identity-agents.tf`.
`DefaultAzureCredential` uses that MI to fetch a bearer token for
`https://cognitiveservices.azure.com/.default`, and Azure OpenAI accepts it
(because `local_auth_enabled = false` and the MI has `Cognitive Services OpenAI
User`). No secret leaves your subscription; every call is attributable to the
agent's identity in the AOAI audit log and App Insights.

Locally, `DefaultAzureCredential` falls back to your `az login` identity — same
code path, same auth headers, no keys.

## Troubleshooting

- **Caddy TLS warning in the browser** — expected the first time. Run
  `make caddy-trust` to install the local CA (or accept the warning).
- **`401 Unauthorized` from AOAI** — your `az` identity needs `Cognitive Services
  OpenAI User` on the AOAI account. Or the MI (in Azure).
- **`404` from Prism** — the Claims OpenAPI spec must be mounted at
  `../azure/workloads/insurance-app/connectors/claims-api.openapi.yaml`. If you
  moved the demo dir, update the volume path in `docker-compose.yml`.
- **`MODE=azure` and empty endpoint** — the API refuses to start; the error
  message names the missing env var.

## Relationship to the platform

This demo is deliberately *narrow* — one agent (`claims-triage-agent`), one
endpoint (`/triage`), a mock Claims API. The full governed platform (Entra
Agent ID, APIM front-door with `validate-azure-ad-token`, Content Safety,
Purview audit, Sentinel) is in [`../azure/`](../azure/) and its
[`README.md`](../azure/README.md). This demo is the "type in a claim, see the
agent respond" experience layered on top.
