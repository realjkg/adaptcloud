# AIDigest

AIDigest is Adapt Cloud's AI news and research service. It is small on purpose: one FastAPI container in the docker-compose stack, its own Postgres schema (`aidigest`), Claude through the Anthropic SDK, a daily scheduler that runs inside the service, and Caddy as the only way in.

See [CODEX.md](CODEX.md) for the rules the service follows, [DESIGN.md](DESIGN.md) for the architecture and threat model, and [EVIDENCE.md](EVIDENCE.md) for the record of how it was tested.

## How it works

**At startup**, it applies `schema.sql` (every statement is `CREATE ... IF NOT EXISTS`), checks
that it's ready, starts the scheduler and begins answering requests.

**Every day** at 12:30 UTC, or when an operator calls `POST /ops/run-daily`, it checks that it's
ready and claims the day's run so the digest is made only once. It reads the curated feeds, scores
the items with fixed rules and sends the best candidates to Claude in a single call to pick and
summarize. It checks the result, saves it in Postgres and publishes it at `/digest`.

**For a task**, it takes the user name that Caddy passes in and checks the request strictly. After
the readiness check, it picks a mode by fixed rules. It fetches up to 3 URLs the user listed and
adds evidence it already has stored. Claude writes the answer in a single call, which the service
checks. It can also save knowledge points backed by sources, then stores everything in Postgres and
responds.

## Configuration

AIDigest runs under the docker-compose profile `aidigest`. `make setup` turns the profile on
(`COMPOSE_PROFILES=aidigest` in `.env`), and Caddy starts with or without any AIDigest value. All
values live in the root `.env` (never committed); `.env.example` lists the names.

| Variable | Used by | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | aidigest | Claude API key |
| `AIDIGEST_DATABASE_URL` | aidigest | `postgresql+asyncpg://aidigest_app:...`, a dedicated least-privilege role (below), **not** a generic `DATABASE_URL` |
| `AIDIGEST_PROXY_SECRET` | aidigest, caddy | Shared secret Caddy sends to the service (`openssl rand -hex 32`, at least 32 characters) |
| `AIDIGEST_BASIC_AUTH_USER` | caddy | Basic-auth user name for `/aidigest/*` |
| `AIDIGEST_BASIC_AUTH_HASH` | caddy | bcrypt hash (cost 10) of that user's password; keep it single-quoted in `.env` because it contains `$` |
| `COMPOSE_PROFILES` | compose | `aidigest` makes `make start` and `docker compose up` start the service |
| `AIDIGEST_MODEL` | aidigest | Optional; default `claude-sonnet-5-5` |
| `AIDIGEST_DAILY_TIME` | aidigest | Optional; `HH:MM` UTC, default `12:30` (7:30 AM CDT / 6:30 AM CST) |

That's five required values (`ANTHROPIC_API_KEY` plus the four `AIDIGEST_*` above) and
`COMPOSE_PROFILES=aidigest`. `make setup` writes all of them; `make setup-aidigest` adds all of
them except the API key to an existing `.env`.

With `PRODUCTION=true` (docker-compose sets it), the service won't start if the API key, the
database URL or the proxy secret is missing, still a placeholder, or too weak. If any of the Caddy
values (`AIDIGEST_BASIC_AUTH_USER`, `AIDIGEST_BASIC_AUTH_HASH`, `AIDIGEST_PROXY_SECRET`) is missing
or empty, alone or together, Caddy still starts. It fills in stand-in values that can never sign
in (the user `aidigest-disabled` and a bcrypt hash of a random value that was thrown away), and it
answers every `/aidigest/*` request with 401 before basic auth even runs.
`scripts/caddy_matrix.sh` checks every combination against the real Caddy.

Limits (all optional, with safe defaults): `AIDIGEST_AI_EFFORT` (`medium`), `AIDIGEST_AI_MAX_TOKENS`
(16000), `AIDIGEST_AI_MAX_CONCURRENCY` (2), `AIDIGEST_TASK_HOURLY_LIMIT` (20 per Basic Auth account, then 429),
`AIDIGEST_TASK_BUDGET_SECONDS` (600), `AIDIGEST_DAILY_BUDGET_SECONDS` (900),
`AIDIGEST_DAILY_LEASE_SECONDS` (1200, must exceed the budget), `AIDIGEST_DAILY_HEARTBEAT_SECONDS`
(60), `AIDIGEST_DAILY_MAX_ATTEMPTS` (3 per UTC day, then 429), `AIDIGEST_FETCH_TOTAL_SECONDS` (30),
`AIDIGEST_FETCH_MAX_BYTES` (1000000), `AIDIGEST_PARSE_TIMEOUT_SECONDS` (10).

### Least-privilege database role (one-time, as a DBA)

AIDigest connects as its own role, which owns **only** the `aidigest` schema. It doesn't need
`CREATE` on the database (startup skips `CREATE SCHEMA` when the schema already exists), and it
can't touch other tables in `public`. Run this as the database owner with `CREATEROLE` (on managed
Postgres, that's the admin or owner role you were given; a superuser works too). Replace `<admin>`
with that role's name and `<dbname>` with the database name (`SELECT current_database();`):

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

**PostgreSQL 14 and older:** by default, every role can create objects in the `public` schema.
Also run `REVOKE CREATE ON SCHEMA public FROM PUBLIC;` (or at least `FROM aidigest_app`), so the
AIDigest role can't create tables next to other data in that database. PostgreSQL 15 and later
already work that way.

On managed Postgres (Neon, Supabase and others), create the role in the provider's console if you
can't run `CREATE ROLE`, then run the `GRANT` and `CREATE SCHEMA ... AUTHORIZATION` lines.

## Upgrading an existing install (read this first)

An existing `.env` keeps working as it is. Without the AIDigest values, the `aidigest` profile
just doesn't start, and Caddy answers `/aidigest/*` with 401. To add AIDigest:

1. Create the database role above.
2. `make setup-aidigest`: it **adds** the AIDigest keys and `COMPOSE_PROFILES=aidigest` to the
   end of `.env`, never changes a key that's already there, and is safe to run again. Avoid `make setup` → overwrite on a
   live install: it replaces every value in `.env`, including the AIDigest password and proxy
   secret (it backs up the old file to `.env.backup` and requires typing `OVERWRITE`).
3. `make aidigest-start`, then `make aidigest-status` (must report `"ready": true`).

## First use (order matters)

1. Configure the database role and auth first (`make setup` on a new install, which asks for the
   AIDigest settings, or `make setup-aidigest` to add them to an existing `.env`).
2. `make aidigest-start` (or `make start` once `COMPOSE_PROFILES=aidigest` is in `.env`).
3. `make aidigest-status` must report `"ready": true` (articles, knowledge, tasks and runs are all present). Don't use the endpoints until it does.
4. If you like, run the first digest now with `make aidigest-run-daily`. Otherwise it runs at the next scheduled time (or right away, once, if the service starts after today's scheduled time).

## Endpoints

All endpoints are under `https://<host>/aidigest`, and all need Caddy's basic-auth sign-in.

- GET /health
- GET /ops/status
- POST /ops/run-daily (starts today's run by hand. Returns 409 if today's run already happened or is running, 429 once the day's attempt limit is reached, 502 if every feed failed (you can retry), and 503 if the service isn't ready)
- GET /digest
- GET /digest.json
- GET /knowledge?q=finops
- POST /agent/tasks (returns 429 with Retry-After once an account reaches its hourly limit. Caddy
  comes with a single basic-auth account, so by default the whole team shares that limit)
- GET /agent/tasks/{id} (only the basic-auth ACCOUNT that created the task can read it; any other
  account gets 404). Tasks are kept apart by account, not by person. Caddy comes with one account,
  so everyone who knows its password shares one `requested_by` and can read any task whose ID they
  know. To keep each person's tasks private, give each person their own basic-auth sign-in (more
  `basic_auth` accounts in the Caddyfile); the service then keeps their tasks apart without any
  code change.

Example task body (checked strictly; unknown fields are rejected):

```json
{
  "task": "Compare recent agent governance developments and identify what changes Adapt Cloud's Frontier Agent Accelerator guidance.",
  "mode": "auto",
  "urls": ["https://example.com/announcement"],
  "persist_knowledge": true
}
```

`mode` is one of `auto`, `research`, `compare`, `summarize`, `knowledge_lookup`, `build_brief`, `opportunity_analysis`. `urls` takes up to 3 HTTPS URLs.

`persist_knowledge` (default `true`) saves the knowledge points the model produces for this task.
The model wrote them with your task text in its prompt, everyone can read them through
`/knowledge`, and they're used as evidence in other people's tasks. Send `false` when the task text
must stay private. See DESIGN.md section 16.1.

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

The tests never call Claude or the internet: the Anthropic client and the fetcher are replaced with fakes. Database tests need a real Postgres. By default they create a throwaway database cluster with `initdb` from `/usr/lib/postgresql/16/bin`, under `/tmp/aidg_pg`, on the first free port from 29650 to 29659 (below the range the system hands out on its own), then stop and delete it. To use a database you already have, set `AIDIGEST_TEST_DATABASE_URL` (the tests drop and recreate the `aidigest` schema in it). If Postgres isn't available the tests fail; a skipped test counts as a failure.

`scripts/mutation_check.py` switches off each security control, one at a time, and confirms that a test fails each time.
