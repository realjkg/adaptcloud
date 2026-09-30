# AIDigest

AIDigest is the initial Adapt Cloud AI intelligence Worker. It is intentionally small: one Worker, one D1 database, one Workers AI binding, one Cron, and Cloudflare Access.

## Loops

BOOTSTRAP:
Cloudflare auth -> automatic binding provisioning -> schema.sql -> final deploy -> /ops/status -> READY

DAILY:
Cron -> curated feeds -> deterministic score -> top candidates -> ONE AI curation -> validate -> D1 -> /digest

TASK:
Access identity -> validate -> deterministic mode -> <=3 read-only evidence steps -> ONE AI synthesis -> validate -> optional source-backed knowledge -> D1 -> response

## No-token runtime

AIDigest has no application bearer token. Protect the Worker itself with Cloudflare Access. The Worker reads the authenticated identity from ctx.access; D1 and Workers AI use bindings.

## D1 provisioning

AIDigest uses Wrangler automatic resource provisioning. There is no D1 UUID to copy into source control.

With Wrangler >=4.45, the binding-only D1 configuration is provisioned and linked on deploy. The bootstrap routine then applies schema.sql and redeploys.

## Bootstrap

From AIDigest, after Cloudflare authentication is available:

npm install
npm run check
npm run bootstrap:cloudflare

The bootstrap sequence is:

1. wrangler deploy — provisions/links D1 and deploys the Worker
2. wrangler d1 execute DB --remote --file=./schema.sql --yes — applies the schema
3. wrangler deploy — final deploy against the initialized database

Then enable Cloudflare Access for the Worker and allow the intended Adapt Cloud identities.

## Endpoints

- GET /health
- GET /ops/status
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
