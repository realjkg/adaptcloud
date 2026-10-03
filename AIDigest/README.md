# AIDigest

AIDigest is Adapt Cloud's AI intelligence service. It is intentionally small: one FastAPI container in the existing docker-compose stack, its own Postgres schema (`aidigest`), Claude through the Anthropic SDK, an in-process daily scheduler, and Caddy as the only way in.

See [CODEX.md](CODEX.md) for the operating contract and guardrails, [DESIGN.md](DESIGN.md) for the architecture and threat model, and [EVIDENCE.md](EVIDENCE.md) for the verification log.

## Loops

STARTUP:
apply schema.sql (CREATE ... IF NOT EXISTS) -> readiness -> scheduler -> serve

DAILY:
12:30 UTC scheduler or POST /ops/run-daily -> readiness gate -> claim the day -> curated feeds -> deterministic score -> top candidates -> ONE Claude curation -> validate -> Postgres -> /digest

TASK:
Caddy identity -> strict validation -> readiness gate -> deterministic mode -> <=3 explicit URLs + stored evidence -> ONE Claude synthesis -> validate -> optional source-backed knowledge -> Postgres -> response

## Configuration

All values live in the root `.env` (never committed). `setup.sh` generates the AIDigest values; `.env.example` lists the names.

| Variable | Used by | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | aidigest | Claude API key (shared with the tutor API) |
| `DATABASE_URL` | aidigest | `postgresql+asyncpg://...`; AIDigest uses only schema `aidigest`. The DB user needs `CREATE` on the database the first time the schema is created |
| `AIDIGEST_PROXY_SECRET` | aidigest, caddy | Shared secret Caddy sends to the service (`openssl rand -hex 32`, at least 32 characters) |
| `AIDIGEST_BASIC_AUTH_USER` | caddy | Basic-auth user name for `/aidigest/*` |
| `AIDIGEST_BASIC_AUTH_HASH` | caddy | bcrypt hash of that user's password (`caddy hash-password`); keep it single-quoted in `.env` because it contains `$` |
| `AIDIGEST_MODEL` | aidigest | Optional; default `claude-sonnet-5-5` |
| `AIDIGEST_DAILY_TIME` | aidigest | Optional; `HH:MM` UTC, default `12:30` (7:30 AM CDT / 6:30 AM CST) |

With `PRODUCTION=true` (set by docker-compose), the service refuses to start if the API key, the database URL or the proxy secret is missing, a placeholder, or weak.

## First use (order matters)

1. Configure auth first: run `make setup` (or add the four `AIDIGEST_*` values and `DATABASE_URL` to `.env` by hand). Compose refuses to start Caddy or AIDigest without them.
2. `make start`.
3. `make aidigest-status` must report `"ready": true` (all of articles, knowledge, tasks and runs present). Do not use the endpoints until it does.
4. Optionally run the first digest now with `make aidigest-run-daily`; otherwise it runs at the next scheduled time.

## Endpoints

All endpoints are served under `https://<host>/aidigest` and require Caddy basic auth.

- GET /health
- GET /ops/status
- POST /ops/run-daily (operator trigger: 409 if today's run already happened, 503 if not ready)
- GET /digest
- GET /digest.json
- GET /knowledge?q=finops
- POST /agent/tasks
- GET /agent/tasks/{id}

Example task body (strictly validated; unknown fields are rejected):

```json
{
  "task": "Compare recent agent governance developments and identify what changes Adapt Cloud's Frontier Agent Accelerator guidance.",
  "mode": "auto",
  "urls": ["https://example.com/announcement"],
  "persist_knowledge": true
}
```

`mode` is one of `auto`, `research`, `compare`, `summarize`, `knowledge_lookup`, `build_brief`, `opportunity_analysis`. `urls` takes at most 3 HTTPS URLs.

```bash
curl -sk -u "$AIDIGEST_BASIC_AUTH_USER" -H 'content-type: application/json' \
  -d @task.json https://localhost/aidigest/agent/tasks
```

## Operations

```bash
make aidigest-status      # /aidigest/ops/status through Caddy (prompts for the basic-auth password)
make aidigest-run-daily   # operator trigger for today's DAILY run
make logs-aidigest        # service logs
```

## Development and tests

```bash
cd AIDigest
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
python -m pytest -q
```

The tests never call Claude or the internet: the Anthropic client and the fetcher are injected fakes. DB tests need a real Postgres. By default they initdb a throwaway cluster from `/usr/lib/postgresql/16/bin` under `/tmp/aidg_pg` on port 57650, then stop and delete it. Set `AIDIGEST_TEST_DATABASE_URL` to use an existing database instead (the tests drop and recreate schema `aidigest` in it). If Postgres is unavailable the tests fail; skipped tests count as failures.

`scripts/mutation_check.py` reverts each security control in turn and confirms that a test fails.
