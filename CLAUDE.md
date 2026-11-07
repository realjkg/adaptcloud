# CLAUDE.md

Guidance for Claude Code when working in this repository. The writing standard in `AGENTS.md` applies to everything here: U.S. English, clear and concise wording, and no renaming of published identifiers, API names or schema fields.

## What is here

| Folder | What it is | Docs |
|---|---|---|
| `ccar-f/` | Claude Certification Study Simulator, a static site published to GitHub Pages. It covers four exam tracks (CCAR-F, CCAR-P, CCDV-F, CCAO-F). | `ccar-f/README.md` |
| `AIDigest/` | AI intelligence service (FastAPI, Postgres, Claude) served behind Caddy at `/aidigest`. | `AIDigest/README.md`, `AIDigest/DESIGN.md` |
| `azure/` | Insurance agent platform on an Azure landing zone, with policy as code and governed agent identities. | `azure/README.md` |
| `insurance-agent-demo/` | The claims-triage agent from `azure/` as a stack you can run locally. | `insurance-agent-demo/README.md` |
| `residency/` | Applied AI Engineering Residency platform contract: one workload across AWS, Azure, GCP and OpenStack. | `residency/README.md` |
| `gke/` | Hardened GKE and Terraform reference deployment. | `gke/README.md` |
| `commercial/outcomes/` | Commercial model, statement-of-work templates and brochure. | files in the folder |
| `main.go`, `chatgpt.go` | Sample webhook services. | |

## Running AIDigest

The root `docker-compose.yml`, `Caddyfile`, `caddy-entrypoint.sh`, `Makefile` and `setup.sh` run AIDigest behind Caddy (TLS on 443). Caddy is the only way in and answers 404 for anything outside `/aidigest/*`.

```bash
make setup            # first run: asks for the Claude API key and AIDigest settings, writes .env, starts the stack
make setup-aidigest   # add AIDigest settings to an existing .env (append-only)
make start / stop / restart / logs / status
make aidigest-status  # must report "ready": true before first use
make caddy-trust      # export Caddy's local root certificate for other devices
```

`.env`, `.env.backup` and every other `.env.*` file except `.env.example` are gitignored. Never commit them. `setup.sh` changes `.env` only through its atomic writer (`env_replace`), and the tests check that.

Tests: `pytest AIDigest/tests` (install `AIDigest/requirements-dev.txt`). They start a throwaway Postgres when `AIDIGEST_TEST_DATABASE_URL` is unset. `AIDigest/scripts/caddy_matrix.sh` runs the Caddy fail-closed checks and needs Docker. `AIDigest/scripts/mutation_check.py` patches exact lines in `setup.sh`, `Caddyfile` and other files, so update its anchors if you change those lines.

## Study simulator

Open `ccar-f/index.html` in a browser, or serve the folder with `python3 -m http.server`. Each track has its own validation workflows in `.github/workflows/` (`ccar-f-*`, `ccar-p-*`, `ccdv-f-*`, `ccao-f-*`, `foundations-*`). Some of them check exact UI strings, so run them before changing labels.

## Checks that look for exact text

`residency-contract-validate.yml` greps `residency/README.md` for provider names, `make` commands, environment names and a few fixed phrases. Keep those strings when you edit that README.
