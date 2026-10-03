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

AIDigest is **optional**: it runs under the docker-compose profile `aidigest`, so the base
homeschool stack starts with or without any AIDigest value. All values live in the root `.env`
(never committed); `.env.example` lists the names.

| Variable | Used by | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | aidigest | Claude API key (shared with the tutor API) |
| `AIDIGEST_DATABASE_URL` | aidigest | `postgresql+asyncpg://aidigest_app:...`, a dedicated least-privilege role (below), **not** the tutor's `DATABASE_URL` |
| `AIDIGEST_PROXY_SECRET` | aidigest, caddy | Shared secret Caddy sends to the service (`openssl rand -hex 32`, at least 32 characters) |
| `AIDIGEST_BASIC_AUTH_USER` | caddy | Basic-auth user name for `/aidigest/*` |
| `AIDIGEST_BASIC_AUTH_HASH` | caddy | bcrypt hash (cost 10) of that user's password; keep it single-quoted in `.env` because it contains `$` |
| `COMPOSE_PROFILES` | compose | `aidigest` makes `make start` / `docker compose up` include the service |
| `AIDIGEST_MODEL` | aidigest | Optional; default `claude-sonnet-5-5` |
| `AIDIGEST_DAILY_TIME` | aidigest | Optional; `HH:MM` UTC, default `12:30` (7:30 AM CDT / 6:30 AM CST) |

That is five required values (`ANTHROPIC_API_KEY` plus the four `AIDIGEST_*` above) and
`COMPOSE_PROFILES=aidigest`. `make setup-aidigest` adds all of them except the API key.

With `PRODUCTION=true` (set by docker-compose), the service refuses to start if the API key, the
database URL or the proxy secret is missing, a placeholder, or weak. If any of the Caddy values
(`AIDIGEST_BASIC_AUTH_USER`, `AIDIGEST_BASIC_AUTH_HASH`, `AIDIGEST_PROXY_SECRET`) is missing or
empty - alone or in any combination - Caddy still starts (non-empty sentinel defaults: user
`aidigest-disabled`, a bcrypt hash of a discarded random value) and answers every `/aidigest/*`
request with 401 before basic auth runs. `scripts/caddy_matrix.sh` checks every combination
against the real Caddy.

Bounds (all optional, safe defaults): `AIDIGEST_AI_EFFORT` (`medium`), `AIDIGEST_AI_MAX_TOKENS`
(16000), `AIDIGEST_AI_MAX_CONCURRENCY` (2), `AIDIGEST_TASK_HOURLY_LIMIT` (20 per user, then 429),
`AIDIGEST_TASK_BUDGET_SECONDS` (600), `AIDIGEST_DAILY_BUDGET_SECONDS` (900),
`AIDIGEST_DAILY_LEASE_SECONDS` (1200, must exceed the budget), `AIDIGEST_DAILY_HEARTBEAT_SECONDS`
(60), `AIDIGEST_DAILY_MAX_ATTEMPTS` (3 per UTC day, then 429), `AIDIGEST_FETCH_TOTAL_SECONDS` (30),
`AIDIGEST_FETCH_MAX_BYTES` (1000000), `AIDIGEST_PARSE_TIMEOUT_SECONDS` (10).

### Least-privilege database role (one-time, as a DBA)

AIDigest connects as its own role that owns **only** schema `aidigest`. It needs no
database-level `CREATE` (startup skips `CREATE SCHEMA` when the schema exists) and has no access
to the homeschool tables in `public`. Run this as an admin role that has `CREATEROLE` and `CREATE`
on the database (a superuser works too). Replace `<admin>` with that admin role's name:

```sql
CREATE ROLE aidigest_app LOGIN PASSWORD '<generate a strong password>';
-- PostgreSQL 16+: a non-superuser CREATEROLE admin must be a member of the new role before it
-- can create a schema owned by it (harmless on older versions and for superusers).
GRANT aidigest_app TO <admin>;
GRANT CONNECT ON DATABASE <dbname> TO aidigest_app;
CREATE SCHEMA IF NOT EXISTS aidigest AUTHORIZATION aidigest_app;
-- Drop the temporary membership again; the role keeps owning its schema.
REVOKE aidigest_app FROM <admin>;
```

Nothing else: no `CREATE` on the database, no grants on schema `public`.

**PostgreSQL 14 and older:** every role may create objects in schema `public` by default. Also
run `REVOKE CREATE ON SCHEMA public FROM PUBLIC;` (or at least `FROM aidigest_app`) so the
AIDigest role cannot create tables next to the homeschool data. PostgreSQL 15+ already defaults
to that.

On managed Postgres (Neon, Supabase, ...) create the role in the provider console if `CREATE
ROLE` is not available to you, then run the `GRANT`/`CREATE SCHEMA ... AUTHORIZATION` lines.

## Upgrading an existing install (read this first)

An existing `.env` keeps working unchanged: without the AIDigest values the `aidigest` profile is
simply not started and Caddy answers `/aidigest/*` with 401. To add AIDigest:

1. Create the database role above.
2. `make setup-aidigest`: it **appends** the AIDigest keys and `COMPOSE_PROFILES=aidigest` to
   `.env`, never edits an existing key and is safe to re-run. Do **not** use `make setup` → overwrite
   on a live install: it regenerates `MASTER_SECRET`, which makes encrypted student data
   unreadable (it now requires typing `OVERWRITE`).
3. `make aidigest-start`, then `make aidigest-status` (must report `"ready": true`).

## First use (order matters)

1. Configure the database role and auth first (`make setup-aidigest`, or a fresh `make setup` and
   answer `y` to "Also set up AIDigest").
2. `make aidigest-start` (or `make start` once `COMPOSE_PROFILES=aidigest` is in `.env`).
3. `make aidigest-status` must report `"ready": true` (all of articles, knowledge, tasks and runs present). Do not use the endpoints until it does.
4. Optionally run the first digest now with `make aidigest-run-daily`; otherwise it runs at the next scheduled time (or immediately, once, if the service starts after today's slot).

## Endpoints

All endpoints are served under `https://<host>/aidigest` and require Caddy basic auth.

- GET /health
- GET /ops/status
- POST /ops/run-daily (operator trigger: 409 if today's run already happened or is running, 429 after the day's attempt cap, 502 if every feed failed - retryable, 503 if not ready)
- GET /digest
- GET /digest.json
- GET /knowledge?q=finops
- POST /agent/tasks (429 with Retry-After after the per-user hourly cap)
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
make aidigest-run-daily   # operator trigger for today's DAILY run (429 after 3 failed attempts)
make aidigest-start       # start the aidigest profile
make setup-aidigest       # append AIDigest settings to an existing .env
make logs-aidigest        # service logs
```

## Development and tests

```bash
cd AIDigest
python -m venv .venv && . .venv/bin/activate
pip install --require-hashes -r requirements-dev.txt   # exact, hash-pinned (pip-compile output)
python -m pytest -q
```

The tests never call Claude or the internet: the Anthropic client and the fetcher are injected fakes. DB tests need a real Postgres. By default they initdb a throwaway cluster from `/usr/lib/postgresql/16/bin` under `/tmp/aidg_pg` on the first free port in 29650-29659 (below the ephemeral port range), then stop and delete it. Set `AIDIGEST_TEST_DATABASE_URL` to use an existing database instead (the tests drop and recreate schema `aidigest` in it). If Postgres is unavailable the tests fail; skipped tests count as failures.

`scripts/mutation_check.py` reverts each security control in turn and confirms that a test fails.
