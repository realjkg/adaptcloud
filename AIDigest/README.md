# AIDigest

AIDigest is the initial Adapt Cloud AI intelligence Worker. It is intentionally small: one Worker, one D1 database, one Workers AI binding, one Cron, and Cloudflare Access.

## Loops

DAILY:
Cron -> curated feeds -> deterministic score -> top candidates -> ONE AI curation -> validate -> D1 -> /digest

TASK:
Access identity -> validate -> deterministic mode -> <=3 read-only evidence steps -> ONE AI synthesis -> validate -> optional source-backed knowledge -> D1 -> response

## No-token runtime
AIDigest has no application bearer token. Protect the Worker itself with Cloudflare Access. The Worker reads the authenticated identity from ctx.access; D1 and Workers AI use bindings.

## Setup

1. cd AIDigest
2. npm install
3. npx wrangler d1 create adaptcloud-ai-digest
4. Paste the returned database_id into wrangler.toml.
5. npm run db:init:remote
6. npm run check
7. npm run deploy
8. Enable Cloudflare Access on the Worker for production and preview URLs and allow the intended Adapt Cloud identities.

## Endpoints

- GET /health
- GET /digest
- GET /digest.json
- GET /knowledge?q=finops
- POST /agent/tasks
- GET /agent/tasks/:id

Example task body:

{
  "task": "Compare recent agent governance developments and identify what changes Adapt Cloud's Frontier Agent Accelerator guidance.",
  "mode": "auto",
  "persist_knowledge": true
}

See CODEX.md for the operating contract and guardrails.
