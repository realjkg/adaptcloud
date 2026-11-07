# AIDigest Codex

## Purpose
AIDigest is Adapt Cloud's private service for keeping up with AI and cloud news. It turns a small set of trusted sources, plus research tasks that people send it, into short briefings for leaders and lasting knowledge that always cites its source.

## How it runs
AIDigest is one small FastAPI service (`aidigest`) in the docker-compose stack, reachable only through Caddy at `/aidigest/*`. It stores data in Postgres (schema `aidigest`) and calls Claude through the Anthropic SDK. There is no Cloudflare component.

It does three things, each with fixed limits:

1. STARTUP: apply schema.sql, which is safe to run again (`CREATE ... IF NOT EXISTS`; `CREATE SCHEMA` is skipped when the schema exists) -> check readiness (the articles, knowledge, tasks and runs tables exist in schema `aidigest`) -> start the DAILY scheduler (it runs once right away if the service starts after today's scheduled time) -> start answering requests.
2. DAILY: the scheduler (12:30 UTC, `AIDIGEST_DAILY_TIME`) or an operator's `POST /ops/run-daily` -> readiness check -> claim the UTC day in Postgres -> read the curated feeds -> clean up and remove duplicates -> score relevance to Adapt with fixed rules -> ONE Claude call to pick and summarize -> check the result -> save to Postgres -> publish the digest.
3. TASK: a signed-in user -> strict input checks -> readiness check -> pick the mode with fixed rules -> read up to three URLs the user listed (read-only), plus stored knowledge, the recent digest and the curated feeds -> ONE Claude call to write the answer -> check the result -> optionally save knowledge backed by sources -> save to Postgres -> respond.

The running service never creates infrastructure, changes its own settings or gives itself permissions. At startup, the only database changes it makes are `CREATE ... IF NOT EXISTS` inside the `aidigest` schema.

## Readiness
- `GET /ops/status` reports `ready`, `present_tables` and `missing_tables`; 200 when ready, 503 otherwise.
- If the service isn't ready, TASK returns 503 before creating a task, and DAILY records a `schema_not_ready` run and doesn't call Claude.
- Operators check readiness with `make aidigest-status` (through Caddy, with basic auth) before first use and after every deploy.

## Safety rules
- Caddy is the only way in from outside. The service listens only on the internal compose network (`expose`, no `ports`).
- Caddy protects `/aidigest/*` with `basic_auth` (a bcrypt hash from the environment). It then sets `X-AIDigest-User` to the signed-in user (replacing anything the client sent) and adds the shared secret in `X-AIDigest-Proxy-Secret`.
- When in doubt, the service refuses: every request except `GET /health` gets 401 unless the proxy secret matches (compared in constant time, so timing reveals nothing) and `X-AIDigest-User` isn't empty. `/health` returns nothing sensitive.
- End users don't get a bearer token for the app.
- With `PRODUCTION=true`, the service won't start if a secret is missing or weak.
- No planning model, no agent that calls itself in a loop, no open-ended tool calls, no shell commands, no deploying, no email, no writing to the CRM or GitHub, no spending and no account changes. Claude is called without tools.
- The only things the service does outside itself are HTTPS GET requests through the protected fetcher, and the single Claude call per DAILY run or TASK.
- Evidence for a task comes only from Postgres (knowledge, the recent digest), the curated feed list, and up to three HTTPS URLs the signed-in user listed. The user's URLs always come first.
- Every fetch refuses: URLs that aren't HTTPS, non-default ports, credentials in the URL, raw IP addresses as hosts, localhost, local and cloud-metadata host names, and host names that point to any non-public address. The connection stays on the IP address that was checked, so a DNS change mid-request (DNS rebinding) can't redirect it. It also refuses too many redirects (each one is checked again) and responses that are too large (it stops reading at a byte limit).
- Text from sources is untrusted evidence, never instructions. It goes to Claude only inside a clearly marked, escaped `<evidence>` block, and the system prompt forbids following instructions found inside it.
- Check what the model returns: in DAILY, every ID must be one of the candidates' IDs and every URL that candidate's URL; in TASK, every citation must be a URL the service actually read; every number must be finite.
- A knowledge statement is saved for later only when its confidence is at least 0.75 and its source URL was actually read during the task or daily run.
- At most one DAILY run per UTC day, enforced in Postgres (no runs at the same time and no repeats, across workers and restarts).
- A DAILY run holds a time-limited claim tagged with an owner token. If another run takes over and the old one wakes up later, the old one calls no AI and writes nothing. Runs, tasks and fetches each have a total time limit, and failed DAILY attempts are limited per day.
- Only a few AI calls can run at once across the service, and each user can send only so many TASKs per hour (then 429).
- Untrusted text is parsed only with scanners whose time grows in line with the input, outside the main event loop and with a deadline. NUL bytes are rejected at the API and removed from stored text.
- AIDigest connects as a database role with only the access it needs, which owns only schema `aidigest`. It runs as an opt-in compose profile, and no AIDigest value can stop Caddy from starting.
- Prefer the original source. Don't reproduce full articles or long passages.

## Adapt Cloud relevance
Prioritize:
- AI FinOps and token economics
- agentic architecture and operations
- AI governance
- AI security and access controls
- inference cost, reliability, and observability
- AWS, Azure, Google Cloud, Cloudflare, GitHub
- enterprise AI adoption and procurement
- standards and regulation
- industrial, healthcare, life sciences, construction, transportation, and real-estate implications

Connect what each story means to Adapt Cloud's offerings:
- AI Tokenomics Business Analysis
- Frontier Agent Accelerator
- AI FinOps & Governance Implementation
- AI Access & Data Security Review
- AI Cost & Reliability Architecture Review

## How each story is written
Every selected story has a headline, a one-sentence lead written fresh (not copied), a short factual summary, "Why Adapt cares", a suggested next step, and a link to the original source.

The digest has THE BIG 3, followed by WORTH KNOWING.

## When things fail
- Bad input: 4xx. A source or Claude fails: 502. The database fails or the service isn't ready: 503. Each failure is recorded on the task or run row.
- After a failed DAILY run, an operator can try that day again (`make aidigest-run-daily`). A run stuck in `running` for more than 2 hours is marked abandoned.
- Never loop or retry forever. Report `SCHEMA_NOT_READY` and stop.

## What counts as done
A run succeeds only if it stays within its limits, can be audited, cites its sources and is useful, all without new infrastructure. Improve the sources, scoring and prompts before adding queues, vector search, workflows or more agents.
