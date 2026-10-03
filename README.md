# adaptcloud
Initial MVP repository and GKE setup
this repo contains secure hardening and will contain chatGPT webhooks as well as GKE hooks for the community to use

## Contents

- `gke/` — hardened GKE / Terraform reference deployment (GCP).
- `azure/` — **insurance agent platform**: a low-code-first insurance application
  (Power Platform + Copilot Studio) plus API connectors, deployed inside an Azure
  Landing Zone with **policy as code** and governed AI **agent identities**, built
  to the Microsoft Cloud Adoption Framework guidance
  *"Govern and secure AI agents across your organization"*. Creates an
  **Application Platform landing zone** if the tenant doesn't have one. See
  [`azure/README.md`](azure/README.md) and
  [`azure/docs/caf-ai-agent-governance-mapping.md`](azure/docs/caf-ai-agent-governance-mapping.md).
- `AIDigest/` — Adapt Cloud AI intelligence service (FastAPI, Postgres, Claude), served
  behind Caddy at `/aidigest`. See [`AIDigest/README.md`](AIDigest/README.md).
- `main.go`, `chatgpt.go` — sample webhook services.

None of this code is expected to go from dev straight to prod — review, parameterize,
and run it through your own pipeline first.
