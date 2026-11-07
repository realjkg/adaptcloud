# adaptcloud

Adapt Cloud's working repository: a Claude certification study app, the AIDigest service, an
insurance agent platform on Azure, a multi-cloud training residency and reference deployments.

## Claude Certification Study Simulator

Study and practice for all four Claude certifications (Architect Foundations and Professional, Developer Foundations, Associate Foundations): flashcards, practice questions, weak-area practice and full timed practice exams, with scores by domain. Each exam keeps its own questions and progress.

- **Open it:** https://realjkg.github.io/adaptcloud/ccar-f/ (add `?track=ccar-f`, `ccar-p`, `ccdv-f` or `ccao-f`)
- **Docs:** [`ccar-f/README.md`](ccar-f/README.md): tracks, exam-guide alignment, how the content is organized and validated

## Contents

- [`ccar-f/`](ccar-f/) — **Claude Certification Study Simulator** (all four tracks; see above).
- [`commercial/outcomes/`](commercial/outcomes/) — proposed renewable AI advisory and engineering commercial model, outcome-based SOW, PromptForce.AI accelerator schedule, and client brochure.

- `gke/` — an older, hardened GKE and Terraform reference deployment (GCP).
- `azure/` — **insurance agent platform**: an insurance app built with low-code tools
  first (Power Platform and Copilot Studio), plus API connectors. It runs inside an
  Azure Landing Zone, with rules enforced as **policy as code** and a separate,
  governed identity for each AI **agent**, following the Microsoft Cloud Adoption
  Framework guidance *"Govern and secure AI agents across your organization"*. It
  creates an **Application Platform landing zone** if the tenant doesn't have one. See
  [`azure/README.md`](azure/README.md) and
  [`azure/docs/caf-ai-agent-governance-mapping.md`](azure/docs/caf-ai-agent-governance-mapping.md).
- `AIDigest/` — Adapt Cloud's AI news and research service (FastAPI, Postgres, Claude),
  served behind Caddy at `/aidigest`. The root `docker-compose.yml`, `Makefile` and
  `setup.sh` run it. See [`AIDigest/README.md`](AIDigest/README.md).
- `insurance-agent-demo/` — the claims-triage agent from `azure/` as a stack you can run
  on your own machine. See [`insurance-agent-demo/README.md`](insurance-agent-demo/README.md).
- `residency/` — Applied AI Engineering Residency: one AI app taken to production the same
  way on AWS, Azure, GCP and OpenStack. See [`residency/README.md`](residency/README.md).
- `main.go`, `chatgpt.go` — sample webhook services.

None of this code should go straight from development to production. Review it, set
your own values, and run it through your own pipeline first.
