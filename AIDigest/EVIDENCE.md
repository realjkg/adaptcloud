# AIDigest verification evidence

Branch `feat/ai-digest-initial` (PR #60), base `f96765d`. Recorded 2026-10-03.

Sections 1-9 record the initial implementation (`351e7b2`). Section 10 records challenger
round 1 and section 11 challenger round 2. **Section 12 records challenger round 3 and
supersedes all earlier gate results** (543 tests on Python 3.11.15 and 3.12.3, each against a
test database named `aidigest_it` and one named `postgres`; 125/125 mutations killed; Caddy
matrix 22 cases green).

Toolchain: Python 3.11.15 (container image: python:3.12-slim), pytest 9.1.1,
pytest-asyncio 1.4.0, FastAPI 0.142.2, SQLAlchemy 2.1.3, asyncpg 0.31.0,
anthropic 1.11.0, httpx 0.28.1, ruff 0.15.20, pip-audit 2.10.1,
detect-secrets 1.5.0, PostgreSQL 16.14, Docker 29.6.2 / Compose v5.3.1,
Caddy v2.11.6.

All commands run from `AIDigest/` unless noted. `$PY` is a venv with
`requirements-dev.txt` installed.

## 1. Red (tests written first) - commit `282793c`

```
$ $PY -m pytest -q
E   ModuleNotFoundError: No module named 'aidigest'
ERROR tests/test_ai.py
ERROR tests/test_api.py
ERROR tests/test_daily.py
ERROR tests/test_feeds.py
ERROR tests/test_fetcher.py
ERROR tests/test_scheduler.py
ERROR tests/test_tasks.py
!!!!!!!!!!!!!!!!!!! Interrupted: 7 errors during collection !!!!!!!!!!!!!!!!!!!!
7 errors in 0.19s
```

## 2. Green - implementation commits `d3aa8bd`, `74d878a`, `a15d192`

```
$ $PY -m pytest -q
339 passed
```

No test is skipped: `tests/conftest.py` turns any skip into a failure, and the
DB tests run against a real PostgreSQL 16 cluster that the session fixture
initdb's under `/tmp/aidg_pg`, starts on the first free port in 29650-29659,
then stops and deletes. No test calls Claude or the internet; the Anthropic
client and the fetcher are injected fakes (`tests/fakes.py`).

Final run: see section 9. The 339 tests break down as follows:

| Test file | Tests | Covers |
|---|---|---|
| test_auth.py | 113 | auth matrix: missing/empty/blank/forged user, missing/wrong/prefix/long/empty secret, x 12 routes; unconfigured secret fails closed; `hmac.compare_digest` spy |
| test_fetcher.py | 75 | every SSRF case: scheme, credentials, IPv4/IPv6/int/hex/short IP literals, localhost/.local/.internal/metadata, port, DNS->private (v4, v6, mixed, mapped, NAT64, 6to4), IP pinning + Host/SNI, DNS rebinding, redirect re-validation and limit, Content-Length pre-check, streamed cap (chunked, lying length) |
| test_tasks.py | 51 | findings 3, 6, 7, 8, 9; knowledge/citation guardrails; output sanitising; one AI call |
| test_daily.py | 34 | findings 2, 3, 4, 10; duplicate, concurrent, restart, retry-after-failure and abandoned-run cases |
| test_ai.py | 23 | Claude adapter (model from settings, no tools, refusal/truncation/API error -> AIError); finite-number and strict JSON parsing |
| test_config.py | 18 | production validation, model default, daily time |
| test_scheduler.py | 8 | next-run computation, loop resilience, scheduled job gated on readiness, lifespan start/stop |
| test_api.py | 12 | finding 1 (startup schema, /ops/status), run-daily endpoint, digest escaping, knowledge query, DB errors -> 503 |
| test_feeds.py | 5 | RSS/Atom parsing, scoring, dedupe |

## 3. Lint and compile

```
$ ruff check .            # config in AIDigest/pyproject.toml (E,F,W,I,B,S)
All checks passed!
$ $PY -m compileall -q aidigest main.py tests scripts && echo compile-ok
compile-ok
```

The repository had no Python linter configuration; ruff (with bandit `S`
rules) is configured for AIDigest only.

## 4. Dependency audit

```
$ pip-audit -r requirements.txt --progress-spinner off
No known vulnerabilities found
```

## 5. Secret scan of the diff

```
$ detect-secrets scan $(changed and added files since f96765d)   # 44 files
detect-secrets findings: 17
$ git diff f96765d -- . | grep '^+' | grep -E 'sk-ant-[A-Za-z0-9_-]{20,}|\$2[aby]\$..\$.{53}|BEGIN .*PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_.{36}|[0-9a-f]{64}'
(none)
```

All 17 detect-secrets hits were reviewed and are false positives:

| Kind | Where | Why it is not a secret |
|---|---|---|
| Secret Keyword | aidigest/auth.py:13 | the header *name* `x-aidigest-proxy-secret` |
| Basic Auth Credentials | aidigest/config.py:13, :35 | placeholder URLs `user:password@host` used to *reject* placeholders |
| Basic Auth Credentials | .env.example:33, :36; setup.sh:60 | pre-existing documentation placeholders (present at `f96765d`) |
| Secret Keyword / Basic Auth | tests/fakes.py, test_auth.py, test_config.py, test_fetcher.py | test fixtures (`test-proxy-secret-...`, `sk-ant-test-not-a-real-key`, `wrong`, `short-secret`, `user:pw@example.com`) |

No real key, password, bcrypt hash or proxy secret is committed; `.env.example`
contains names only.

## 6. Mutation check (security controls)

```
$ $PY scripts/mutation_check.py
```

Each row reverts one control in a scratch copy and runs the suite with `-x`.
"killed" means at least one test failed, which is what we want.

| # | Mutation | Control reverted | Result | Suite tail |
|---|---|---|---|---|
| 1 | `auth-secret-always-ok` | proxy shared secret is verified | killed | 1 failed, 48 passed in 5.72s |
| 2 | `auth-non-constant-time` | constant-time compare (hmac.compare_digest) | killed | 1 failed, 147 passed in 14.10s |
| 3 | `auth-user-header-optional` | X-AIDigest-User must be present and non-empty | killed | 1 failed, 60 passed in 6.58s |
| 4 | `auth-empty-configured-secret-trusted` | fail closed when no proxy secret is configured | killed | 1 failed, 146 passed in 13.31s |
| 5 | `auth-all-paths-public` | only /health is public | killed | 1 failed, 23 passed in 3.51s |
| 6 | `config-no-production-validation` | production refuses weak/missing secrets | killed | 1 failed, 151 passed in 13.76s |
| 7 | `config-weak-proxy-secret-allowed` | proxy secret length/placeholder check | killed | 1 failed, 152 passed in 13.27s |
| 8 | `ssrf-allow-http` | HTTPS only | killed | 1 failed, 205 passed in 17.73s |
| 9 | `ssrf-allow-credentials` | reject credentials in URL | killed | 1 failed, 207 passed in 17.98s |
| 10 | `ssrf-allow-other-ports` | default port only | killed | 1 failed, 223 passed in 23.99s |
| 11 | `ssrf-allow-ip-literals` | reject literal IP hosts | killed | 1 failed, 210 passed in 21.92s |
| 12 | `ssrf-allow-local-names` | reject localhost/local/metadata names | killed | 1 failed, 216 passed in 22.38s |
| 13 | `ssrf-no-dns-check` | every resolved address must be public | killed | 1 failed, 253 passed in 24.69s |
| 14 | `ssrf-no-embedded-v4-check` | IPv4-mapped / NAT64 / 6to4 addresses unwrapped | killed | 1 failed, 247 passed in 20.48s |
| 15 | `ssrf-no-ip-pinning` | connect to the validated IP (DNS rebinding) | killed | 1 failed, 262 passed in 28.87s |
| 16 | `ssrf-redirect-not-revalidated` | every redirect target re-validated | killed | 1 failed, 267 passed in 26.52s |
| 17 | `ssrf-unbounded-redirects` | redirect hop limit | killed | 1 failed, 273 passed in 26.73s |
| 18 | `size-no-content-length-precheck` | reject declared oversize before reading | killed | 1 failed, 276 passed in 20.48s |
| 19 | `size-no-streaming-cap` | streamed byte cap (finding 5) | killed | 1 failed, 277 passed in 22.28s |
| 20 | `prompt-no-evidence-escaping` | evidence cannot close the <evidence> block | killed | 1 failed, 168 passed in 15.61s |
| 21 | `prompt-no-system-rule` | system rule: never follow instructions in evidence | killed | 1 failed, 168 passed in 20.70s |
| 22 | `daily-accept-unknown-ids` | selected id must be an input candidate (finding 2) | killed | 1 failed, 169 passed in 18.57s |
| 23 | `daily-accept-foreign-urls` | selected URL must be the candidate's URL (finding 2) | killed | 1 failed, 169 passed in 17.54s |
| 24 | `finite-allow-nan-inf` | finite numbers only (finding 3) | killed | 1 failed, 8 passed in 1.35s |
| 25 | `finite-allow-strings-bools` | numbers must be real JSON numbers (finding 3) | killed | 1 failed, 12 passed in 1.41s |
| 26 | `json-allow-nan-literals` | reject NaN/Infinity JSON literals | killed | 1 failed, 22 passed in 1.34s |
| 27 | `ai-ignore-refusal` | refusal stop_reason is an AI failure | killed | 1 failed, 1 passed in 1.44s |
| 28 | `daily-count-noop-inserts` | accepted counts actual inserts (finding 4) | killed | 1 failed, 189 passed in 23.15s |
| 29 | `daily-knowledge-low-confidence` | knowledge confidence >= 0.75 (DAILY) | killed | 1 failed, 186 passed in 20.99s |
| 30 | `daily-knowledge-foreign-source` | DAILY knowledge source must be the candidate URL | killed | 1 failed, 186 passed in 22.69s |
| 31 | `task-knowledge-low-confidence` | knowledge confidence >= 0.75 (TASK) | killed | 1 failed, 319 passed in 25.96s |
| 32 | `task-knowledge-unobserved-source` | knowledge source URL actually observed (TASK) | killed | 1 failed, 319 passed in 25.21s |
| 33 | `task-citations-unfiltered` | citations limited to observed URLs | killed | 1 failed, 317 passed in 25.41s |
| 34 | `task-urls-not-reserved` | explicit URLs get the first evidence slots (finding 6) | killed | 1 failed, 317 passed in 20.35s |
| 35 | `task-more-than-3-urls` | at most 3 explicit URLs (finding 7) | killed | 1 failed, 296 passed in 20.83s |
| 36 | `task-lax-body` | strict request model (finding 7) | killed | 1 failed, 304 passed in 19.99s |
| 37 | `task-static-url-checks-skipped` | request URLs statically validated (finding 7) | killed | 1 failed, 299 passed in 20.91s |
| 38 | `errors-upstream-as-400` | upstream/AI failures are 502 (finding 8) | killed | 1 failed, 29 passed in 3.74s |
| 39 | `errors-not-recorded` | failures recorded on the task row (finding 8) | killed | 1 failed, 323 passed in 22.07s |
| 40 | `task-no-readiness-gate` | TASK gated on readiness (finding 9) | killed | 1 failed, 331 passed in 23.76s |
| 41 | `daily-no-readiness-gate` | DAILY gated on readiness (finding 10) | killed | 1 failed, 28 passed in 3.90s |
| 42 | `status-always-200` | /ops/status reports not-ready as 503 (finding 1) | killed | 1 failed, 26 passed in 3.77s |
| 43 | `daily-no-duplicate-guard` | one DAILY run per day (unique run row) | killed | 1 failed, 27 passed in 3.61s |
| 44 | `digest-no-html-escape` | digest HTML escaping | killed | 1 failed, 30 passed in 4.18s |
| 45 | `digest-non-https-links` | digest links only https:// URLs | killed | 1 failed, 30 passed in 4.31s |

45/45 mutations killed, 0 survived.

First run (before two tests were strengthened): 43/45 killed. Survivors and fixes:

| Mutation | Why it survived | Fix (test) |
|---|---|---|
| `daily-accept-unknown-ids` | the only unknown-id case also carried a foreign URL, so the URL check rejected it first | added an unknown id **without** a `url` field to `test_daily_rejects_unknown_ids_and_foreign_urls` |
| `ai-ignore-refusal` | the refusal fixture had empty text, so the "no text" check raised instead | refusal fixture now carries parseable text (`test_anthropic_adapter_refusal_is_ai_error`) |

Both were re-run individually (killed) and then the full set above was re-run.

## 7. Container and proxy wiring

### docker compose config (repo root)

```
$ env -i PATH=$PATH HOME=$HOME ANTHROPIC_API_KEY=x SECRET_KEY=x MASTER_SECRET=x \
    PARENT_PASSWORD=x CHILD_PIN=x DATABASE_URL=x docker compose config -q
error while interpolating services.aidigest.environment.[]: required variable
AIDIGEST_PROXY_SECRET is missing a value: AIDIGEST_PROXY_SECRET is required
$ (same) + AIDIGEST_PROXY_SECRET=s AIDIGEST_BASIC_AUTH_USER=u AIDIGEST_BASIC_AUTH_HASH='$2a$14$...' docker compose config
-> renders; aidigest: build ./AIDigest, cap_drop [ALL], expose ["8000"], no ports,
   read_only true, security_opt [no-new-privileges:true], tmpfs /tmp, network internal,
   PRODUCTION "true"; caddy gets the three AIDIGEST_* variables
```

A single-quoted bcrypt hash in an env file passes through compose
interpolation intact (verified with `--env-file`).

### Caddyfile

```
$ docker run --rm -v $PWD/Caddyfile:/etc/caddy/Caddyfile:ro -e AIDIGEST_BASIC_AUTH_USER=ops \
    -e AIDIGEST_BASIC_AUTH_HASH='$2a$14$...' -e AIDIGEST_PROXY_SECRET=... caddy:2-alpine \
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
Valid configuration
```

Adapted JSON: `/aidigest/*` -> `request_body max_size 64000` -> `authentication
http_basic (bcrypt)` -> `reverse_proxy aidigest:8000` with request headers
`set X-Aidigest-User {http.auth.user.id}` and `set X-Aidigest-Proxy-Secret`;
the UI route `delete`s both headers.

### Image build

```
$ docker build -t aidigest:test AIDigest/
```

Built from a scratch copy of the context with the sandbox's TLS-intercepting
proxy CA added before `pip install` (the sandbox's network requirement; the
committed Dockerfile is unchanged). Result: runs as `uid=1000(aidigest)`,
healthcheck `python -c urllib.request.urlopen('http://127.0.0.1:8000/health')`.

### End-to-end smoke test (real Caddy + aidigest image + postgres:16)

A scratch compose project with the same hardening as `docker-compose.yml`
(`read_only`, `cap_drop: [ALL]`, `no-new-privileges`, tmpfs, `expose` only,
`PRODUCTION=true`) and the repo Caddyfile. The only difference was `tls
internal { on_demand }`, because the repo's existing `:443 { tls internal }`
issues no certificate for an unknown SNI (pre-existing behaviour,
unchanged by this PR). Requests came from a container on the compose network:

```
1 no credentials /ops/status                    -> 401
2 no credentials + forged trust headers         -> 401
3 wrong password                                -> 401
4 valid basic auth /ops/status                  -> 200 {"service":"AIDigest",...,"authenticated_as":"ops","ready":true,"schema":"aidigest",...}
5 valid auth + forged X-AIDigest-User: admin    -> 200, authenticated_as = ops   (Caddy overwrote the header)
6 valid auth /health                            -> 200 {"status":"ok"}
7 valid auth GET unknown task                   -> 404 {"error":"Task not found"}
8 valid auth POST invalid task body             -> 422 (string_too_short, extra_forbidden)
9 valid auth POST body > 64KB                   -> 413 (Caddy request_body cap)
10 /aidigest redirect                           -> 308
11 valid auth /digest.json                      -> 200 []
forged headers sent directly to aidigest:8000 from another container  -> 401
forged user + empty secret directly to aidigest:8000                  -> 401
aidigest /health directly                                             -> {"status":"ok"}
docker compose port aidigest 8000                                     -> no host port
aidigest container: ReadonlyRootfs=true CapDrop=[ALL] SecurityOpt=[no-new-privileges:true] User=aidigest
Postgres: aidigest.articles, aidigest.knowledge, aidigest.runs, aidigest.tasks (created at startup)

Caddy started with EMPTY AIDIGEST_BASIC_AUTH_USER/HASH:  no auth / valid creds / empty creds -> 401 / 401 / 401
Caddy holding a WRONG proxy secret:                       no auth / valid creds / empty creds -> 401 / 401 / 401
PRODUCTION=true with AIDIGEST_PROXY_SECRET=short -> refuses to start:
  ValidationError ... AIDIGEST_PROXY_SECRET must be at least 32 random characters
```

### TLS pinning check (manual, real TLS)

Local HTTPS server with a certificate for `pin.example` on 127.0.0.1:443,
fetcher resolver answering 127.0.0.1 (the public-address check was disabled
for this experiment only):

```
OK: host=pin.example path=/hello          # connected to the pinned IP, Host + SNI = hostname, cert verified
wrong-host rejected: UpstreamError ...    # https://other.example -> certificate does not match -> refused
```

## 8. Notes

- The `setup.sh` hashing step was checked: `printf '%s\n' "$pw" | docker run
  --rm -i caddy:2-alpine caddy hash-password` prints a `$2a$14$` bcrypt hash
  (the password never appears on a command line).
- `make aidigest-status` / `make aidigest-run-daily` call
  `https://localhost/aidigest/...` with `curl -u $AIDIGEST_BASIC_AUTH_USER`
  (password prompted) and `--fail-with-body`, so a 503 not-ready exits non-zero.

## 9. Final gate run

```
$ $PY -m pytest -q -rs
...................................................                      [100%]
339 passed in 24.59s
$ ruff check .
All checks passed!
$ $PY -m compileall -q aidigest main.py tests scripts && echo compile-ok
compile-ok
$ pip-audit -r requirements.txt --progress-spinner off
No known vulnerabilities found
```

The test cluster directory `/tmp/aidg_pg` is gone after the run (stopped and deleted).

## 10. Challenger round 1 (review of `351e7b2`: REQUEST_CHANGES)

This section supersedes sections 1-9 for gate results. Commits:

| SHA | What |
|---|---|
| `1e4dc66` | failing tests for H1, M1-M8, L1-L7 (red) |
| `1544690` | linear-time feed parsing off the event loop (H1) |
| `a8fdb83` | fetcher: total deadline, IDNA host, bounded decoding, more IP ranges (M1, M3, M4, M5, L2) |
| `dd9773f` | run leases, budgets, rate limits, least-privilege DB role, NUL, effort, catch-up, L7 |
| `f34f78f` | setup.sh append-only AIDigest path; guarded overwrite (M7, L3, L6) |
| `9a60801` | compose profile, hash-pinned deps, README upgrade + role SQL (M7, M8, L6) |
| `34aa472` | 91-mutation check; explicit IP policy layer tested directly |
| `d38bfc0` | H1 tests also assert near-linear scaling |
| this commit | budget test bounds itself; DESIGN.md section 10, CODEX.md, this evidence |

### 10.1 Red (`1e4dc66`)

```
$ $PY -m pytest -q -p no:cacheprovider --continue-on-collection-errors
69 failed, 324 passed, 1 error in 110.59s
ERROR tests/test_daily.py: ImportError: cannot import name 'DailyConfig' from 'aidigest.daily'
11 adversarial inputs killed by the 6 s child budget (H1 confirmed):
  lt-run, item-open-run, item-tag-unclosed, item-title-lt, title-open-run, script-open-run,
  style-open-run, cdata-open-run, comment-open-run, nested-tags, atom-href-run
```

Note: in a first red draft, the two `/health` heartbeat tests passed against the old inline
parser. The fake fetch never yields, so the parse ran back to back and only then did the
heartbeat run. They were rewritten as a continuous ticker (maximum gap between `/health`
answers) and failed red before the red commit.

### 10.2 Green

```
$ $PY -m pytest -q -rs -p no:cacheprovider
............................                                             [100%]
460 passed in 36.59s
```

No test is skipped (skips are converted to failures). The private Postgres cluster ran on the first free port in 29650-29659 and was stopped and deleted afterwards.

| Test file | Tests |
|---|---|
| test_fetcher.py | 125 |
| test_auth.py | 113 |
| test_tasks.py | 61 |
| test_daily.py | 46 |
| test_config.py | 27 |
| test_ai.py | 25 |
| test_parsing_dos.py | 25 |
| test_api.py | 15 |
| test_scheduler.py | 11 |
| test_setup_sh.py | 6 |
| test_feeds.py | 5 |
| test_db_role.py | 1 |
| **total** | **460** |

### 10.3 H1 measurements (1 MB inputs, after the fix)

```
lt-run 0.227s  item-open-run 0.035s  item-tag-unclosed 0.116s  item-title-lt 0.218s
title-open-run 0.007s  script-open-run 0.005s  script-unclosed 0.005s  style-open-run 0.004s
style-unclosed 0.005s  cdata-open-run 0.005s  cdata-unclosed 0.005s  comment-open-run 0.004s
nested-tags 0.005s  tag-no-close 0.005s  atom-href-run 0.042s  atom-link-long 0.005s
atom-rel-run 0.009s  entity-run 0.076s  double-entity-run 0.098s  ampersand-run 0.031s
pubdate-long 0.006s          worst: 0.23 s (before: >6 s killed for 11 inputs)
```

### 10.4 M5 gzip bomb

```
200 MB of zeros gzip'd -> 203,860 bytes on the wire, cap 1 MB:
raised: Source too large (decoded); tracemalloc peak 2,209,248 bytes  (challenger: 148 MB peak)
```

### 10.5 Mutation check (91 mutations: 45 original + 46 for round 1)

```
$ $PY scripts/mutation_check.py
```

| # | Mutation | Control reverted | Result | Suite tail |
|---|---|---|---|---|
| 1 | `auth-secret-always-ok` | proxy shared secret is verified | killed | 1 failed, 53 passed in 5.94s |
| 2 | `auth-non-constant-time` | constant-time compare (hmac.compare_digest) | killed | 1 failed, 152 passed in 15.44s |
| 3 | `auth-user-header-optional` | X-AIDigest-User must be present and non-empty | killed | 1 failed, 65 passed in 7.02s |
| 4 | `auth-empty-configured-secret-trusted` | fail closed when no proxy secret is configured | killed | 1 failed, 151 passed in 15.20s |
| 5 | `auth-all-paths-public` | only /health is public | killed | 1 failed, 25 passed in 3.97s |
| 6 | `config-no-production-validation` | production refuses weak/missing secrets | killed | 1 failed, 156 passed in 14.61s |
| 7 | `config-weak-proxy-secret-allowed` | proxy secret length/placeholder check | killed | 1 failed, 157 passed in 14.37s |
| 8 | `ssrf-allow-http` | HTTPS only | killed | 1 failed, 232 passed in 21.31s |
| 9 | `ssrf-allow-credentials` | reject credentials in URL | killed | 1 failed, 234 passed in 21.32s |
| 10 | `ssrf-allow-other-ports` | default port only | killed | 1 failed, 250 passed in 21.12s |
| 11 | `ssrf-allow-ip-literals` | reject literal IP hosts | killed | 1 failed, 237 passed in 22.64s |
| 12 | `ssrf-allow-local-names` | reject localhost/local/metadata names | killed | 1 failed, 243 passed in 21.23s |
| 13 | `ssrf-no-dns-check` | every resolved address must be public | killed | 1 failed, 280 passed in 24.75s |
| 14 | `ssrf-no-embedded-v4-check` | IPv4-mapped / NAT64 / 6to4 addresses unwrapped | killed | 1 failed, 343 passed in 28.01s |
| 15 | `ssrf-no-ip-pinning` | connect to the validated IP (DNS rebinding) | killed | 1 failed, 289 passed in 22.23s |
| 16 | `ssrf-redirect-not-revalidated` | every redirect target re-validated | killed | 1 failed, 294 passed in 21.25s |
| 17 | `ssrf-unbounded-redirects` | redirect hop limit | killed | 1 failed, 300 passed in 22.55s |
| 18 | `size-no-content-length-precheck` | reject declared oversize before reading | killed | 1 failed, 303 passed in 20.93s |
| 19 | `size-no-streaming-cap` | streamed byte cap (finding 5) | killed | 1 failed, 304 passed in 20.36s |
| 20 | `prompt-no-evidence-escaping` | evidence cannot close the <evidence> block | killed | 1 failed, 182 passed in 14.64s |
| 21 | `prompt-no-system-rule` | system rule: never follow instructions in evidence | killed | 1 failed, 182 passed in 15.91s |
| 22 | `daily-accept-unknown-ids` | selected id must be an input candidate (finding 2) | killed | 1 failed, 183 passed in 15.96s |
| 23 | `daily-accept-foreign-urls` | selected URL must be the candidate's URL (finding 2) | killed | 1 failed, 183 passed in 14.83s |
| 24 | `finite-allow-nan-inf` | finite numbers only (finding 3) | killed | 1 failed, 8 passed in 1.55s |
| 25 | `finite-allow-strings-bools` | numbers must be real JSON numbers (finding 3) | killed | 1 failed, 12 passed in 1.60s |
| 26 | `json-allow-nan-literals` | reject NaN/Infinity JSON literals | killed | 1 failed, 22 passed in 1.48s |
| 27 | `ai-ignore-refusal` | refusal stop_reason is an AI failure | killed | 1 failed, 1 passed in 1.39s |
| 28 | `daily-count-noop-inserts` | accepted counts actual inserts (finding 4) | killed | 1 failed, 203 passed in 17.76s |
| 29 | `daily-knowledge-low-confidence` | knowledge confidence >= 0.75 (DAILY) | killed | 1 failed, 200 passed in 18.08s |
| 30 | `daily-knowledge-foreign-source` | DAILY knowledge source must be the candidate URL | killed | 1 failed, 200 passed in 16.22s |
| 31 | `task-knowledge-low-confidence` | knowledge confidence >= 0.75 (TASK) | killed | 1 failed, 430 passed in 31.79s |
| 32 | `task-knowledge-unobserved-source` | knowledge source URL actually fetched in this TASK (L7) | killed | 1 failed, 430 passed in 32.94s |
| 33 | `task-citations-unfiltered` | citations limited to observed URLs | killed | 1 failed, 428 passed in 32.58s |
| 34 | `task-urls-not-reserved` | explicit URLs get the first evidence slots (finding 6) | killed | 1 failed, 428 passed in 32.52s |
| 35 | `task-more-than-3-urls` | at most 3 explicit URLs (finding 7) | killed | 1 failed, 407 passed in 31.13s |
| 36 | `task-lax-body` | strict request model (finding 7) | killed | 1 failed, 415 passed in 31.22s |
| 37 | `task-static-url-checks-skipped` | request URLs statically validated (finding 7) | killed | 1 failed, 410 passed in 30.58s |
| 38 | `errors-upstream-as-400` | upstream/AI failures are 502 (finding 8) | killed | 1 failed, 31 passed in 4.09s |
| 39 | `errors-not-recorded` | failures recorded on the task row (finding 8) | killed | 1 failed, 434 passed in 33.14s |
| 40 | `task-no-readiness-gate` | TASK gated on readiness (finding 9) | killed | 1 failed, 442 passed in 33.60s |
| 41 | `daily-no-readiness-gate` | DAILY gated on readiness (finding 10) | killed | 1 failed, 30 passed in 3.91s |
| 42 | `status-always-200` | /ops/status reports not-ready as 503 (finding 1) | killed | 1 failed, 28 passed in 3.62s |
| 43 | `daily-no-duplicate-guard` | one DAILY run per day (unique run row) | killed | 1 failed, 29 passed in 3.85s |
| 44 | `digest-no-html-escape` | digest HTML escaping | killed | 1 failed, 32 passed in 4.16s |
| 45 | `digest-non-https-links` | digest links only https:// URLs | killed | 1 failed, 32 passed in 4.07s |
| 46 | `h1-quadratic-tag-scan` | linear tag stripping (no rescans after a missing '>') | killed | 1 failed, 358 passed in 24.70s |
| 47 | `h1-quadratic-element-scan` | linear item/entry scan (stop at a missing close tag) | killed | 1 failed, 359 passed in 29.46s |
| 48 | `h1-feed-parse-on-loop` | feed parsing runs in a worker thread | killed | 1 failed, 379 passed in 28.94s |
| 49 | `h1-page-clean-on-loop` | TASK page cleaning runs in a worker thread | killed | 1 failed, 381 passed in 28.78s |
| 50 | `h1-no-parse-deadline` | parsing is bounded by a deadline | killed | 1 failed, 380 passed in 28.53s |
| 51 | `m1-no-fetch-deadline` | total deadline per fetch (slowloris) | killed | 1 failed, 321 passed in 26.04s |
| 52 | `m1-no-daily-budget` | DAILY run budget | killed | suite timed out (900 s) |
| 53 | `m1-no-task-budget` | TASK budget | killed | 1 failed, 455 passed in 34.96s |
| 54 | `m2-no-owner-check-before-ai` | ownership re-checked before the AI call | killed | 1 failed, 214 passed in 18.23s |
| 55 | `m2-store-without-owner` | store+complete requires owner and running | killed | 1 failed, 215 passed in 19.45s |
| 56 | `m2-takeover-ignores-lease` | only an expired lease may be taken over | killed | 1 failed, 210 passed in 17.76s |
| 57 | `m2-refresh-without-owner` | heartbeat only extends our own running lease | killed | 1 failed, 216 passed in 19.12s |
| 58 | `m2-lease-not-longer-than-budget` | lease must exceed the run budget (DailyConfig) | killed | 1 failed, 218 passed in 19.31s |
| 59 | `m2-settings-lease-check` | lease must exceed the run budget (Settings) | killed | 1 failed, 173 passed in 14.90s |
| 60 | `m3-clean-text-keeps-nul` | NUL stripped from feed/page text | killed | 1 failed, 220 passed in 20.61s |
| 61 | `m3-model-output-keeps-nul` | NUL stripped from model output | killed | 1 failed, 220 passed in 20.78s |
| 62 | `m3-task-allows-nul` | NUL in task text is a 422 | killed | 1 failed, 450 passed in 36.36s |
| 63 | `m3-q-allows-nul` | NUL in ?q= is a 400 | killed | 1 failed, 37 passed in 4.73s |
| 64 | `m4-unicode-host` | IDNA host for DNS, Host and SNI | killed | 1 failed, 325 passed in 21.95s |
| 65 | `m4-body-errors-unmapped` | mid-body transport errors are 502 | killed | 1 failed, 323 passed in 21.44s |
| 66 | `m4-no-charset-fallback` | unknown charset falls back to UTF-8 | killed | 1 failed, 324 passed in 22.49s |
| 67 | `m5-accepts-compression` | Accept-Encoding: identity | killed | 1 failed, 328 passed in 22.40s |
| 68 | `m5-unbounded-decompress` | decompression bounded by the remaining byte budget | killed | 1 failed, 329 passed in 22.83s |
| 69 | `m5-unsupported-encoding-accepted` | unknown content encodings refused | killed | 1 failed, 331 passed in 22.27s |
| 70 | `m6-unbounded-ai-concurrency` | global AI concurrency cap | killed | 1 failed, 456 passed in 36.83s |
| 71 | `m6-no-hourly-cap` | per-user hourly TASK cap | killed | 1 failed, 456 passed in 36.94s |
| 72 | `m6-hourly-cap-not-atomic` | count-then-insert serialised per user | killed | 1 failed, 456 passed in 37.29s |
| 73 | `m6-no-daily-attempt-cap` | DAILY attempts capped per UTC day | killed | 1 failed, 39 passed in 5.53s |
| 74 | `m7-setup-rewrites-existing-keys` | setup --aidigest never duplicates/changes existing keys | killed | 1 failed, 393 passed in 30.55s |
| 75 | `m7-setup-overwrite-unconfirmed` | overwrite requires typing OVERWRITE | killed | 1 failed, 397 passed in 33.38s |
| 76 | `m8-always-create-schema` | CREATE SCHEMA skipped when the schema exists | killed | 1 failed, 226 passed in 23.52s |
| 77 | `l1-trust-env-proxies` | environment proxies ignored | killed | 1 failed, 320 passed in 24.56s |
| 78 | `l1-no-url-text-cap` | fetched page text capped | killed | 1 failed, 453 passed in 41.29s |
| 79 | `l1-no-digest-csp` | /digest Content-Security-Policy | killed | 1 failed, 38 passed in 5.37s |
| 80 | `l1-unbounded-candidates` | <= 12 DAILY candidates | killed | 1 failed, 222 passed in 20.93s |
| 81 | `l1-unbounded-knowledge-per-item` | <= 3 knowledge points per item | killed | 1 failed, 223 passed in 20.51s |
| 82 | `l1-default-redirects` | default redirect limit 2 | killed | 1 failed, 172 passed in 14.81s |
| 83 | `l1-default-max-bytes` | default byte cap 1 MB | killed | 1 failed, 172 passed in 15.85s |
| 84 | `l1-default-max-tokens` | default max_tokens 16k | killed | 1 failed, 23 passed in 1.55s |
| 85 | `l2-reserved-allowed` | reserved addresses are not public | killed | 1 failed, 336 passed in 21.53s |
| 86 | `l2-ipv4-embedding-v6-allowed` | IPv4-compatible/-translated/local NAT64 ranges rejected | killed | 1 failed, 342 passed in 21.88s |
| 87 | `l2-policy-layer-skipped` | explicit policy layer applied on top of is_global | killed | 1 failed, 264 passed in 20.51s |
| 88 | `l4-no-catch-up` | scheduler catch-up after start past the slot | killed | 1 failed, 390 passed in 30.75s |
| 89 | `l5-no-explicit-effort` | explicit effort on the Claude call | killed | 1 failed in 1.45s |
| 90 | `l5-truncation-accepted` | max_tokens stop is an AI failure | killed | 1 failed, 2 passed in 1.61s |
| 91 | `l7-single-entity-pass` | entities decoded to a fixed point | killed | 1 failed, 225 passed in 20.10s |

91/91 mutations killed, 0 survived.

Mutation 52 (`m1-no-daily-budget`) was counted as killed by the script's 900 s suite timeout:
without the budget, `test_daily_run_budget` waited forever. The test now bounds itself with an
outer `asyncio.wait_for(..., 5)`, and that mutation was re-run alone:

```
$ $PY scripts/mutation_check.py --only m1-no-daily-budget
baseline: PASS (460 passed in 38.27s) 40s
killed   m1-no-daily-budget                     1 failed, 219 passed in 23.71s (25s)
```

How the 46 new mutations were made to fail. Two partial runs (stopped to fix tests, then re-run
in full above) found survivors:

| Survivor | Why it survived | Fix |
|---|---|---|
| `ssrf-no-embedded-v4-check` (90-mutation version) | `ipaddress.is_global` already rejects 6to4, Teredo and IPv4-mapped ranges on 3.11 and 3.12, so the explicit check was a second, untested layer | Explicit rules moved into `policy_blocks()` with direct tests (`test_policy_layer_*`, `test_reserved_but_stdlib_global_address_is_rejected`) |
| `h1-quadratic-tag-scan` | `str.find` is memchr-fast; the reintroduced quadratic rescan of 1 MB finished just under the 6 s child budget | Each adversarial case also asserts near-linear scaling between N/4 and N |

### 10.6 Dependency audit (hash-pinned)

```
$ pip-audit -r requirements.txt --progress-spinner off
No known vulnerabilities found
$ pip-audit -r requirements-dev.txt --progress-spinner off
No known vulnerabilities found
```

`requirements.txt` / `requirements-dev.txt` are `pip-compile --generate-hashes` output (exact
versions, sha256 hashes); the Dockerfile installs with `--require-hashes`. The image built on
Python 3.12 with hash checking enforced.

### 10.7 M7: the base stack with a pre-PR `.env`

`pre-PR.env` holds exactly the nine keys the original `setup.sh` wrote (no AIDigest values):

```
$ docker compose --env-file pre-PR.env config --services
api
ui
caddy
$ docker compose --env-file pre-PR.env config -q; echo $?
0
$ docker compose --env-file pre-PR.env --profile aidigest config --services
aidigest
api
ui
caddy
caddy environment (pre-PR.env): {'AIDIGEST_BASIC_AUTH_HASH': '', 'AIDIGEST_BASIC_AUTH_USER': '', 'AIDIGEST_PROXY_SECRET': ''}  depends_on: ['ui']
environment keys per base service, pre-PR compose file vs this branch (same pre-PR.env):
  api and ui identical; caddy gains only the three empty AIDIGEST_* keys
```

`tests/test_setup_sh.py` runs `setup.sh --aidigest` against a pre-PR `.env` fixture:
- the original bytes are an exact prefix of the result, so SECRET_KEY and MASTER_SECRET are byte-identical
- a re-run leaves the file byte-identical
- existing AIDigest keys and an existing COMPOSE_PROFILES are kept
- the default answer changes nothing
- overwrite without the typed `OVERWRITE` changes nothing and creates no backup

### 10.8 End-to-end (rebuilt hash-pinned image, real Caddy, postgres:16, compose profile)

Same hardening as before (`read_only`, `cap_drop: [ALL]`, `no-new-privileges`, `expose` only,
`PRODUCTION=true`). The service ran under `profiles: ["aidigest"]` as the least-privilege role
`aidigest_app`: it owns the pre-created schema `aidigest`, has no database CREATE and has no
grant on `public.student_configs`. The bcrypt hash used cost 10 (`$2a$10$`).
`ANTHROPIC_BASE_URL` pointed at a closed local port, so no request left the sandbox.

```
startup log: AIDigest readiness: ready=True missing=[]
startup log: Catch-up DAILY after start past 12:30 UTC: {'status': 'completed', ...}     (L4)
1 no credentials /ops/status                           -> 401
2 forged trust headers, no credentials                 -> 401
3 wrong password                                       -> 401
4 valid auth + forged X-AIDigest-User: admin           -> 200 authenticated_as=ops ready=True
5 /health                                              -> 200 {"status":"ok"}
6 run-daily after the startup catch-up                 -> 409 {"status":"duplicate","run_key":"daily:2026-10-03"}
7 knowledge ?q=ab%00cd                                 -> 400 q must not contain NUL characters   (M3)
8 task with NUL                                        -> 422                                     (M3)
9 task body > 64KB                                     -> 413 (Caddy)
10.1/10.2 tasks (hourly limit 2, AI unreachable)       -> 502 Claude API error: APIConnectionError
10.3 third task                                        -> 429 Task limit of 2 per hour reached, retry-after=3600 (M6)
11 task with IP-literal URL                            -> 422
psql as aidigest_app: has_database_privilege(CREATE) = f; SELECT public.student_configs -> permission denied (M8)
pg_namespace: aidigest owned by aidigest_app
```

### 10.9 Secret scan, lint, compile

```
$ ruff check .   (AIDigest/)
All checks passed!
$ $PY -m compileall -q aidigest main.py tests scripts && echo compile-ok
compile-ok
$ bash -n setup.sh && echo syntax-ok
syntax-ok
$ detect-secrets scan <49 files changed since f96765d>
findings: 18
  .env.example Basic Auth Credentials line 33
  .env.example Basic Auth Credentials line 36
  AIDigest/aidigest/auth.py Secret Keyword line 13
  AIDigest/aidigest/config.py Basic Auth Credentials line 14
  AIDigest/aidigest/config.py Basic Auth Credentials line 38
  AIDigest/tests/fakes.py Secret Keyword line 8
  AIDigest/tests/fakes.py Secret Keyword line 16
  AIDigest/tests/test_auth.py Secret Keyword line 45
  AIDigest/tests/test_auth.py Secret Keyword line 96
  AIDigest/tests/test_config.py Secret Keyword line 10
  AIDigest/tests/test_config.py Secret Keyword line 33
  AIDigest/tests/test_config.py Secret Keyword line 34
  AIDigest/tests/test_config.py Secret Keyword line 36
  AIDigest/tests/test_config.py Secret Keyword line 37
  AIDigest/tests/test_config.py Basic Auth Credentials line 39
  AIDigest/tests/test_fetcher.py Basic Auth Credentials line 41
  AIDigest/tests/test_setup_sh.py Basic Auth Credentials line 20
  setup.sh Basic Auth Credentials line 53
$ regex scan of added lines, excluding pip-compile "--hash=sha256:" pins
5409:+FAKE_HASH = "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234"
5415:+SECRET_KEY=1111111111111111111111111111111111111111111111111111111111111111
5416:+MASTER_SECRET=2222222222222222222222222222222222222222222222222222222222222222
```

All detect-secrets hits are the false positives triaged in section 5, plus two more placeholders: `tests/test_setup_sh.py:20` (fixture `sage:pw@db.example.com`) and `setup.sh:53` (format hint `aidigest_app:pass@host`). The remaining regex hits are test fixtures: an alphabet-pattern fake bcrypt hash and `1111.../2222...` placeholder secrets. The 64-hex matches excluded above are the sha256 package pins in `requirements*.txt`.

### 10.10 Notes and limits

- **Mutation layout:** `scripts/mutation_check.py` copies `AIDigest/` plus the root `setup.sh` into each scratch directory, so the setup.sh mutations are covered too. The compose profile itself has no pytest; it is covered by the `docker compose config` proof above.
- **Trickling server (M1):** the test uses an httpx MockTransport whose body yields one byte per 100 ms. That exercises the same `asyncio.wait_for` total deadline a socket-level slowloris would hit.
- **TLS on unknown SNI:** the e2e Caddyfile again differed only by `tls internal { on_demand }`, because of the pre-existing missing certificate for unknown SNI noted in section 7.
- **Equivalent mutants found and fixed:** the partial run of the 90-mutation version showed `ssrf-no-embedded-v4-check` surviving. On Python 3.11 and 3.12, `ipaddress.is_global` already rejects 6to4, Teredo and IPv4-mapped ranges, so the explicit checks are a second layer. That layer is now `policy_blocks()`, which has its own direct tests (including the reserved-but-"global" `4000::1`), and each of its rules is killed individually.


## 11. Challenger round 2 (review of `59f2c34`: 0 High, 3 Medium, 8 Low)

This section supersedes sections 1-10 for gate results.

| SHA | What |
|---|---|
| `7ff25c9` | failing tests for round 2 (red), `scripts/caddy_matrix.sh` |
| `0b4e06f` | O(1) work per wire chunk + periodic loop yield; text-codec-only decoding; IPv4-mapped by its IPv4; version 0.4.0 in the user agent (M1, L1, M3, L8) |
| `2700210` | dedicated bounded parser executor; huge charref guard (L6, L1) |
| `64fa77f` | lease times from the DB clock; all-feeds-failed is a failed run (L7, L2) |
| `70d0abc` | Caddy always adapts; any missing/partial AIDigest config is 401 (M2) |
| `dc5538c` | setup.sh fills empty keys in place; README role SQL for PG16 non-superuser admins + PG<=14 note (L3, L4) |
| `66346bd` | 113-mutation check (22 new); codec checks layered so each has its own test |
| this commit | DESIGN.md section 11, README fail-closed text, this evidence |

### 11.1 Red (`7ff25c9`)

```
Python 3.11.15: 27 failed, 470 passed
Python 3.12.3:  30 failed, 467 passed   (the 3 extra: IPv4-mapped cases)
scripts/caddy_matrix.sh: 3 failure(s)
  user set, hash empty  -> caddy adapt ERROR: basic_auth: username and password cannot be empty or missing
  user empty, hash set  -> caddy adapt ERROR: (same)
  user+hash set, no proxy secret -> ops:<right password> got 502 (Caddy let it through)
```

### 11.2 Green: both Python versions, no skips

```
$ /tmp/adv/bin/python -m pytest -q -rs -p no:cacheprovider      # Python 3.11.15
497 passed in 52.24s
$ /tmp/adv312/bin/python -m pytest -q -rs -p no:cacheprovider   # Python 3.12.3
497 passed in 53.01s
```

The `py312` venv was built from the hash-pinned `requirements-dev.txt` (`pip install --require-hashes`) on the system Python 3.12.3.

### 11.3 M1 measurements

```
child process, one byte per wire chunk (gzip: hex text, ~2:1):
gzip     N/4 = 57,496 wire bytes in 0.090 s    N = 228,285 wire bytes in 0.374 s   (challenger: 200k chunks = 575 s)
identity N/4 = 50,000 wire bytes in 0.058 s    N = 200,000 wire bytes in 0.212 s
without the periodic yield, a never-suspending 1M-chunk stream stalled the loop for 1.08 s; with it the test's max gap is < 0.25 s
```

### 11.4 M2: `scripts/caddy_matrix.sh` (real Caddy v2.11.6, environment resolved by `docker compose config`)

```
== user empty, hash empty
  ok    caddy adapt                                  adapted
  ok    no credentials                               401
  ok    ops:<right password>                         401
  ok    aidigest-disabled:<right password>           401
  ok    ops:<wrong password>                         401
== user set,   hash empty
  ok    caddy adapt                                  adapted
  ok    no credentials                               401
  ok    ops:<right password>                         401
  ok    aidigest-disabled:<right password>           401
  ok    ops:<wrong password>                         401
== user empty, hash set
  ok    caddy adapt                                  adapted
  ok    no credentials                               401
  ok    ops:<right password>                         401
  ok    aidigest-disabled:<right password>           401
  ok    ops:<wrong password>                         401
== user set,   hash set
  ok    caddy adapt                                  adapted
  ok    no credentials                               401
  ok    ops:<right password>                         502
  ok    aidigest-disabled:<right password>           401
  ok    ops:<wrong password>                         401
== user+hash set, no secret
  ok    caddy adapt                                  adapted
  ok    no credentials                               401
  ok    ops:<right password>                         401
  ok    aidigest-disabled:<right password>           401
  ok    ops:<wrong password>                         401
== outside compose, no AIDIGEST_* variables at all
  ok    caddy adapt                                  adapted
  ok    no credentials                               401
  ok    aidigest-disabled:<right password>           401

caddy matrix: all expectations met
```

401 = Caddy denied; 502 = authentication passed (the matrix runs Caddy without an aidigest upstream). As
before, the probe copy of the Caddyfile adds only `tls internal { on_demand }`.

### 11.5 Base stack with a pre-PR `.env` (new defaults)

```
$ docker compose --env-file pre-PR.env config --services
api
ui
caddy
$ docker compose --env-file pre-PR.env config -q; echo $?
0
$ (pre-PR.env) caddy environment as rendered
{'AIDIGEST_BASIC_AUTH_HASH': '$$2a$$10$$UA...', 'AIDIGEST_BASIC_AUTH_USER': 'aidigest-dis...', 'AIDIGEST_PROXY_SECRET': ''} depends_on: ['ui']
```

### 11.6 Mutation check: 113 mutations (45 + 46 + 22 new)

```
$ MUTATION_PY312=/tmp/adv312/bin/python $PY scripts/mutation_check.py
baseline: PASS (497 passed in 38.91s)
113/113 mutations killed, 0 survived.
```

Round-2 rows (the full 113-row table is printed by the script):

| # | Mutation | Control reverted | Result | Suite tail |
|---|---|---|---|---|
| 92 | `r2-m1-quadratic-decoded-total` | O(1) per chunk: running decoded total (gzip path) | killed | 1 failed, 365 passed in 52.53s |
| 93 | `r2-m1-no-periodic-yield` | read loop yields to the event loop periodically | killed | 1 failed, 368 passed in 24.64s |
| 94 | `r2-m2-no-unconfigured-guard` | /aidigest/* is 401 unless fully configured (Caddy) | killed | caddy matrix: 2 failure(s) |
| 95 | `r2-m2-no-user-sentinel` | compose maps an empty user to a non-empty sentinel | killed | caddy matrix: 2 failure(s) |
| 96 | `r2-m2-no-hash-sentinel` | compose maps an empty hash to a non-empty sentinel | killed | caddy matrix: 2 failure(s) |
| 97 | `r2-m2-guard-ignores-secret` | /aidigest/* is 401 without a proxy secret (Caddy) | killed | caddy matrix: 1 failure(s) |
| 98 | `r2-m3-no-mapped-unwrap` | IPv4-mapped judged by its IPv4 (observable on 3.12.3) | killed | 1 failed, 363 passed in 22.39s |
| 99 | `r2-l1-non-text-codec-allowed` | only text codecs decode bodies | killed | 1 failed, 369 passed in 26.07s |
| 100 | `r2-l1-decode-errors-unmapped` | decode errors are 502 | killed | 1 failed, 371 passed in 24.47s |
| 101 | `r2-l1-huge-charref` | huge numeric charrefs neutralised before html.unescape | killed | 1 failed, 406 passed in 26.94s |
| 102 | `r2-l2-all-feeds-failed-completes` | all feeds failing is a failed (retryable) run | killed | 1 failed, 183 passed in 13.68s |
| 103 | `r2-l3-empty-keys-not-filled` | setup.sh fills empty AIDigest keys | killed | 1 failed, 429 passed in 32.27s |
| 104 | `r2-l4-readme-no-member-grant` | README role SQL works for a PG16 non-superuser admin | killed | 1 failed, 233 passed in 20.42s |
| 105 | `r2-l5-max-retries` | Claude client max_retries=1 | killed | 1 failed, 23 passed in 1.50s |
| 106 | `r2-l5-items-per-feed` | <= 25 items per feed | killed | 1 failed, 239 passed in 20.39s |
| 107 | `r2-l5-description-cap` | <= 1800-char descriptions | killed | 1 failed, 240 passed in 22.89s |
| 108 | `r2-l5-run-key-local-date` | run_key uses the UTC date | killed | 1 failed, 231 passed in 21.21s |
| 109 | `r2-l5-no-claim-lock` | claims serialised by the per-day advisory lock | killed | 1 failed, 230 passed in 24.34s |
| 110 | `r2-l5-heartbeat-never-runs` | the heartbeat extends the lease | killed | 1 failed, 229 passed in 26.16s |
| 111 | `r2-l6-default-executor` | parsers use the dedicated bounded executor | killed | 1 failed, 241 passed in 22.48s |
| 112 | `r2-l7-replica-clock-lease` | lease timestamps from the DB clock | killed | 1 failed, 29 passed in 3.78s |
| 113 | `r2-l8-hardcoded-user-agent` | one version string | killed | 1 failed, 40 passed in 5.22s |

Runners: the `r2-m2-*` mutations run `scripts/caddy_matrix.sh` against the mutated Caddyfile/compose file
instead of pytest. `r2-m3-no-mapped-unwrap` runs under Python 3.12.3, because on 3.11 the stdlib flags make
the unwrap unobservable.

A first pass over the 22 round-2 mutations left two survivors, fixed before the full run:
- `r2-m1-no-periodic-yield`: 200k chunks stalled the loop for only 0.19 s, under the 0.25 s bar. The test now streams 1M chunks (1.08 s stall without the yield).
- `r2-l1-decode-errors-unmapped`: every tested charset was refused by the text-codec check first. The redundant idna/punycode/undefined deny-list was removed; those codecs fail inside `decode` and now exercise the try/except alone.

`URL control characters` (challenger L5): an equivalent mutant. httpx's URL parser itself rejects NUL, CR/LF,
TAB and DEL in host and path (checked), so the explicit check cannot change behaviour. It stays as defence in
depth, and `test_validate_url_rejects_control_characters` covers the behaviour.

### 11.7 Lint, compile, dependency audit

```
$ ruff check .
All checks passed!
$ python -m compileall -q aidigest main.py tests scripts && echo compile-ok
compile-ok
$ bash -n setup.sh && bash -n AIDigest/scripts/caddy_matrix.sh && echo syntax-ok
syntax-ok
$ pip-audit -r requirements.txt
No known vulnerabilities found
$ pip-audit -r requirements-dev.txt
No known vulnerabilities found
```

### 11.8 Secret scan

```
$ detect-secrets scan <50 files changed since f96765d>
findings: 19
  .env.example Basic Auth Credentials line 33
  .env.example Basic Auth Credentials line 36
  AIDigest/aidigest/auth.py Secret Keyword line 13
  AIDigest/aidigest/config.py Basic Auth Credentials line 14
  AIDigest/aidigest/config.py Basic Auth Credentials line 38
  AIDigest/scripts/caddy_matrix.sh Secret Keyword line 20
  AIDigest/tests/fakes.py Secret Keyword line 8
  AIDigest/tests/fakes.py Secret Keyword line 16
  AIDigest/tests/test_auth.py Secret Keyword line 45
  AIDigest/tests/test_auth.py Secret Keyword line 96
  AIDigest/tests/test_config.py Secret Keyword line 10
  AIDigest/tests/test_config.py Secret Keyword line 33
  AIDigest/tests/test_config.py Secret Keyword line 34
  AIDigest/tests/test_config.py Secret Keyword line 36
  AIDigest/tests/test_config.py Secret Keyword line 37
  AIDigest/tests/test_config.py Basic Auth Credentials line 39
  AIDigest/tests/test_fetcher.py Basic Auth Credentials line 41
  AIDigest/tests/test_setup_sh.py Basic Auth Credentials line 20
  setup.sh Basic Auth Credentials line 53
$ regex scan of added lines, excluding pip-compile "--hash=sha256:" pins
+5409:+FAKE_HASH = "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234"
+5415:+SECRET_KEY=1111111111111111111111111111111111111111111111111111111111111111
+5416:+MASTER_SECRET=2222222222222222222222222222222222222222222222222222222222222222
+SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
+      [("../docker-compose.yml", "${AIDIGEST_BASIC_AUTH_HASH:-$$2a$$10$$UAJZae21lSiIPJHsYElle.vS3Fc.ggO2jGQOn0iy5GlfjR8fa9hvW}", "${AIDIGEST_BASIC_AU
+FAKE_HASH = "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234"
+SECRET_KEY=1111111111111111111111111111111111111111111111111111111111111111
+MASTER_SECRET=2222222222222222222222222222222222222222222222222222222222222222
+      @aidigest_unconfigured expression `{env.AIDIGEST_BASIC_AUTH_USER} in ["", "aidigest-disabled"] || {env.AIDIGEST_BASIC_AUTH_HASH} in ["", "$2a$1
+        {$AIDIGEST_BASIC_AUTH_USER:aidigest-disabled} {$AIDIGEST_BASIC_AUTH_HASH:$2a$10$UAJZae21lSiIPJHsYElle.vS3Fc.ggO2jGQOn0iy5GlfjR8fa9hvW}
+      - AIDIGEST_BASIC_AUTH_HASH=${AIDIGEST_BASIC_AUTH_HASH:-$$2a$$10$$UAJZae21lSiIPJHsYElle.vS3Fc.ggO2jGQOn0iy5GlfjR8fa9hvW}
```

New since section 10:
- **The committed sentinel bcrypt hash** (Caddyfile, docker-compose.yml with `$$`, the mutation definition): it is the hash of 48 random bytes that were piped straight into `caddy hash-password` and never stored, so no password matches it. It is a placeholder that keeps `basic_auth` syntactically valid; the guard route answers 401 before `basic_auth` whenever it is in effect.
- **`scripts/caddy_matrix.sh`:** a throwaway password and proxy secret, used only for an ephemeral local Caddy.

Everything else is the fixture and placeholder triage of sections 5 and 10.

### 11.9 End-to-end (rebuilt image 0.4.0, compose profile, least-privilege role, real Caddy)

```
startup: AIDigest readiness: ready=True missing=[]
startup: Catch-up DAILY failed -> UpstreamError: All feeds failed: ... ConnectError ...   (no egress in the sandbox; L2)
1 no credentials                                -> 401
2 sentinel user aidigest-disabled + right pw    -> 401
3 valid auth + forged X-AIDigest-User: admin    -> 200 authenticated_as=ops version=0.4.0       (L8)
4.1 run-daily (all feeds fail)                  -> 502 All feeds failed ...                      (retryable)
4.2 run-daily (all feeds fail)                  -> 502
4.3 run-daily                                   -> 429 attempts_exhausted (3 failed attempts today)
runs: failed|schedule, failed|operator, failed|operator; lease_until - created_at = 1200 s (DB clock, UTC)
```

## 12. Challenger round 3 (review of `7e710a0`: 0 High, 2 Medium, 0 Low)

This section supersedes sections 1-11 for gate results.

| SHA | What |
|---|---|
| `3c7f775` | M2: role SQL test uses `current_database()`, rebuilds URLs with `URL.create`; `AIDIGEST_TEST_DBNAME` (red against `aidigest_it` first) |
| `56eefc1` | M1: failing tests (red) - Settings/setup.sh user and secret rules, temp-file trap, 17 new Caddy matrix cases |
| `efa9b3d` | M1: heredoc tokens for user/hash, proxy secret read at request time, format-checking guard, `caddy-entrypoint.sh`, Settings `aidigest_basic_auth_user`, setup.sh rules + trap |
| `7a8bba5` | M2: documented role SQL runs as the database owner (PUBLIC CONNECT revoked in the test); README updated |
| `73bb6ff` | 12 round-3 mutations (125 total); compose sentinels removed (the entrypoint is the single sanitising mechanism); behavioural trap test; outside-compose matrix cases; `MUTATION_PY312` fails loudly |
| this commit | DESIGN.md section 12 and auth text, this evidence |

### 12.1 Red

```
M2 (the hard-coded-`postgres` role test, run against a test database named aidigest_it, Python 3.11.15):
FAILED tests/test_db_role.py::test_documented_role_sql_works_for_non_superuser_admin
1 failed, 17 passed in 4.17s

M1 (56eefc1, Python 3.11.15):
39 failed, 504 passed     (test_config user/secret rules, test_setup_sh user rules + temp-file trap)

M1 scripts/caddy_matrix.sh against the 7e710a0 Caddyfile: 8 failure(s)
  FAIL  caddy adapt                                  expected adapted got ERROR: ding after '$2a$10$mZKy5KJqT3IqqmojZUpjReRscVM59tdmcQ7Qv7Yr.eCvV9W5/STFa', at /etc/caddy/Caddyfile:31, at /etc/caddy/Caddyfile:37, at /etc/caddy/Caddyfile:38"} 
  FAIL  caddy adapt                                  expected adapted got ERROR: tokens for 'basic_auth': username and password cannot be empty or missing, at /etc/caddy/Caddyfile:31, at /etc/caddy/Caddyfile:37, at /etc/caddy/Caddyfile:38"} 
  FAIL  configured user:<right password>             expected 401 got 502
  FAIL  configured user:<right password>             expected 401 got 502
  FAIL  configured user:<right password>             expected 401 got 502
  FAIL  configured user:<right password>             expected 401 got 502
  FAIL  caddy adapt                                  expected adapted got ERROR: proxy': wrong argument count or unexpected line ending after 'passphrase', at /etc/caddy/Caddyfile:35, at /etc/caddy/Caddyfile:37, at /etc/caddy/Caddyfile:38"} 
  FAIL  caddy adapt                                  expected adapted got ERROR: or 'basic_auth': wrong argument count or unexpected line ending after 'a', at /etc/caddy/Caddyfile:31, at /etc/caddy/Caddyfile:37, at /etc/caddy/Caddyfile:38"} 
```

The four `502` lines are usernames with `"`, `'`, braces and a backtick: the old Caddyfile let them
through to the service. The adapt errors are a username/secret with spaces and a non-bcrypt hash.

### 12.2 Green: two Python versions x two database names, no skips

```
$ AIDIGEST_TEST_DBNAME=aidigest_it /tmp/adv/bin/python -m pytest -q -rs -p no:cacheprovider   # Python 3.11.15
543 passed in 37.82s
$ AIDIGEST_TEST_DBNAME=postgres /tmp/adv/bin/python -m pytest -q -rs -p no:cacheprovider   # Python 3.11.15
543 passed in 38.70s
$ AIDIGEST_TEST_DBNAME=aidigest_it /tmp/adv312/bin/python -m pytest -q -rs -p no:cacheprovider   # Python 3.12.3
543 passed in 40.42s
$ AIDIGEST_TEST_DBNAME=postgres /tmp/adv312/bin/python -m pytest -q -rs -p no:cacheprovider   # Python 3.12.3
543 passed in 38.38s
```

`AIDIGEST_TEST_DBNAME` makes the fixture create that database in the private cluster
(ports 29650-29659) and point every DB test at it.

### 12.3 M1: `scripts/caddy_matrix.sh` (real Caddy v2.11.6; compose cases start Caddy through `caddy-entrypoint.sh`)

22 cases, 143 checks, every case: `caddy adapt` succeeds, the homeschool UI answers 200, and
`/aidigest/*` is 401 unless user, hash and secret are all present and valid (then 502 here, because
the matrix has no AIDigest backend - i.e. Caddy let the request through).

```
== user empty, hash empty
== user set,   hash empty
== user empty, hash set
== user set,   hash set
== user+hash set, no secret
== user with a space
== user is a single space
== user with a double quote
== user with a single quote
== user with braces
== user with a backtick
== secret with spaces
== secret with " and braces
== secret with ' and braces
== hash is not a bcrypt hash
== hash with a double quote
== hash with spaces
== outside compose: no AIDIGEST_* variables at all
== outside compose: user with a space
== outside compose: user with a double quote
== outside compose: user with braces
== outside compose: secret with spaces

== user with a space
  ok    compose caddy command                        ["/bin/sh","/usr/local/bin/caddy-entrypoint.sh"]
  ok    caddy adapt (via entrypoint)                 adapted
  ok    homeschool UI /                              200
  ok    no credentials                               401
  ok    configured user:<right password>             401
  ok    aidigest-disabled:<right password>           401
  ok    configured user:<wrong password>             401
== hash is not a bcrypt hash
  ok    compose caddy command                        ["/bin/sh","/usr/local/bin/caddy-entrypoint.sh"]
  ok    caddy adapt (via entrypoint)                 adapted
  ok    homeschool UI /                              200
  ok    no credentials                               401
  ok    configured user:<right password>             401
  ok    aidigest-disabled:<right password>           401
  ok    configured user:<wrong password>             401
== outside compose: user with braces
  ok    caddy adapt                                  adapted
  ok    homeschool UI /                              200
  ok    no credentials                               401
  ok    aidigest-disabled:<right password>           401
  ok    configured user:<right password>             401

caddy matrix: all expectations met
```

The "outside compose" cases run plain `caddy run` with no entrypoint, so the Caddyfile alone
(heredoc tokens + guard) must cope. A non-bcrypt hash outside compose still stops Caddy at
provision time (Caddy refuses a hash that is neither `$...` nor base64); compose always starts
Caddy through the entrypoint, and the matrix asserts the compose `command`. A newline in the
username is not in the matrix: `docker --env-file` cannot carry one; the entrypoint rejects
multi-line values (`single_line`) and Settings/setup.sh reject control characters.

Scan for other unquoted interpolation: `grep -n '{\$' Caddyfile` lists only the two heredoc
bodies (user, hash); the proxy secret is now `{env.*}` (runtime, a
quoted `header_up` value). A comment that contained a literal placeholder was reworded, because
Caddy substitutes inside comments too.

### 12.4 Base stack with a pre-PR `.env`

```
$ docker compose --env-file pre-PR.env config --services
api
ui
caddy
$ docker compose --env-file pre-PR.env config -q; echo $?
0
$ (pre-PR.env) caddy command, environment, mounts as rendered
command: ['/bin/sh', '/usr/local/bin/caddy-entrypoint.sh']
environment: {'AIDIGEST_BASIC_AUTH_HASH': '', 'AIDIGEST_BASIC_AUTH_USER': '', 'AIDIGEST_PROXY_SECRET': ''}
mounts: ['Caddyfile:/etc/caddy/Caddyfile', 'caddy-entrypoint.sh:/usr/local/bin/caddy-entrypoint.sh', 'caddy_data:/data']
```

### 12.5 Mutation check: 125 mutations (113 + 12 new)

```
$ AIDIGEST_TEST_DBNAME=aidigest_it MUTATION_PY312=/tmp/adv312/bin/python $PY scripts/mutation_check.py
py312 interpreter: /tmp/adv312/bin/python
test database name: aidigest_it
baseline: PASS (543 passed in 38.55s)
125/125 mutations killed, 0 survived.
```

Round-3 and replaced rows:

| # | Mutation | Control reverted | Result | Suite tail |
|---|---|---|---|---|
| 95 | `r2-m2-entrypoint-keeps-bad-user` | entrypoint replaces a missing/malformed user (Caddy must start) | killed | caddy matrix: 2 failure(s) |
| 96 | `r2-m2-compose-skips-entrypoint` | compose starts Caddy through caddy-entrypoint.sh | killed | caddy matrix: 17 failure(s) |
| 97 | `r2-m2-guard-ignores-secret` | /aidigest/* is 401 without a proxy secret (Caddy) | killed | caddy matrix: 3 failure(s) |
| 114 | `r3-m1-user-hash-not-heredoc` | user/hash are heredoc tokens (spaces/quotes cannot split them) | killed | caddy matrix: 1 failure(s) |
| 115 | `r3-m1-secret-substituted-into-caddyfile` | proxy secret read at request time, not substituted | killed | caddy matrix: 2 failure(s) |
| 116 | `r3-m1-guard-no-user-format` | guard requires a well-formed user | killed | caddy matrix: 3 failure(s) |
| 117 | `r3-m1-guard-no-secret-format` | guard requires a printable, whitespace-free secret | killed | caddy matrix: 2 failure(s) |
| 118 | `r3-m1-entrypoint-keeps-bad-hash` | entrypoint replaces a malformed hash (Caddy must start) | killed | caddy matrix: 7 failure(s) |
| 119 | `r3-m1-settings-secret-chars` | Settings rejects whitespace/control in the proxy secret | killed | 1 failed, 181 passed in 12.10s |
| 120 | `r3-m1-settings-user-chars` | Settings rejects unsafe basic-auth user names | killed | 1 failed, 193 passed in 12.99s |
| 121 | `r3-m1-settings-user-required` | production requires the basic-auth user | killed | 1 failed, 213 passed in 12.59s |
| 122 | `r3-m1-setup-user-length` | setup.sh limits the user name to 64 characters | killed | 1 failed, 473 passed in 34.54s |
| 123 | `r3-m1-setup-reserved-user` | setup.sh refuses the placeholder user name | killed | 1 failed, 474 passed in 31.83s |
| 124 | `r3-note-no-temp-trap` | setup.sh removes its temp file on INT/TERM | killed | 1 failed, 475 passed in 30.26s |
| 125 | `r3-m2-readme-hardcoded-db` | README role SQL grants CONNECT on <dbname> (needs a non-postgres test DB) | killed | 1 failed, 270 passed in 20.96s |

Survivors on the first round-3 pass, and what killed them:
- `r3-m1-user-hash-not-heredoc`, `r3-m1-guard-no-user-format`: inside compose the entrypoint
  already replaced the bad user, so neither control was exercised. Added the "outside compose"
  matrix cases (no entrypoint).
- `r2-m2-no-user-sentinel`, `r2-m2-no-hash-sentinel` (compose `:-sentinel` defaults): redundant with
  the entrypoint. Removed the compose defaults; the entrypoint is the single mechanism, covered by
  `r2-m2-entrypoint-keeps-bad-user`, `r3-m1-entrypoint-keeps-bad-hash` and
  `r2-m2-compose-skips-entrypoint`.
- `r3-note-no-temp-trap`: the text assertion still matched `trap - INT TERM`. Replaced with a
  behavioural test (SIGTERM to the real `aidigest_fill_empty` while it rewrites a 150k-line `.env`).

`r3-m2-readme-hardcoded-db` is killed only when the test database is not `postgres`, which is why
the run uses `AIDIGEST_TEST_DBNAME=aidigest_it`.

`MUTATION_PY312` missing or wrong now stops the run before any work:

```
$ env -u MUTATION_PY312 $PY scripts/mutation_check.py
MUTATION_PY312 is not set; it must point to a Python 3.12.x interpreter with requirements-dev.txt installed (needed for the py312 mutations)
exit=1
$ MUTATION_PY312=/tmp/adv/bin/python $PY scripts/mutation_check.py   # a 3.11 interpreter
MUTATION_PY312='/tmp/adv/bin/python' is Python 3.11.15, expected 3.12.x
exit=1
$ MUTATION_PY312=/nonexistent/python $PY scripts/mutation_check.py
MUTATION_PY312='/nonexistent/python' is not usable: [Errno 2] No such file or directory: '/nonexistent/python'
exit=1
```

### 12.6 Gates

```
$ ruff check .
All checks passed!
$ python -m compileall -q aidigest main.py tests scripts && echo compile-ok
compile-ok
$ bash -n setup.sh && bash -n AIDigest/scripts/caddy_matrix.sh && sh -n caddy-entrypoint.sh && echo syntax-ok
syntax-ok
$ pip-audit -r requirements.txt
No known vulnerabilities found
$ pip-audit -r requirements-dev.txt
No known vulnerabilities found
```

### 12.7 Secret scan (all changes since `f96765d`)

```
$ detect-secrets scan <51 files changed since f96765d>
findings: 20
  .env.example Basic Auth Credentials line 33
  .env.example Basic Auth Credentials line 36
  AIDigest/aidigest/auth.py Secret Keyword line 13
  AIDigest/aidigest/config.py Basic Auth Credentials line 14
  AIDigest/aidigest/config.py Basic Auth Credentials line 42
  AIDigest/scripts/caddy_matrix.sh Secret Keyword line 26
  AIDigest/tests/fakes.py Secret Keyword line 8
  AIDigest/tests/fakes.py Secret Keyword line 16
  AIDigest/tests/test_auth.py Secret Keyword line 45
  AIDigest/tests/test_auth.py Secret Keyword line 96
  AIDigest/tests/test_config.py Secret Keyword line 10
  AIDigest/tests/test_config.py Secret Keyword line 34
  AIDigest/tests/test_config.py Secret Keyword line 35
  AIDigest/tests/test_config.py Secret Keyword line 37
  AIDigest/tests/test_config.py Secret Keyword line 38
  AIDigest/tests/test_config.py Basic Auth Credentials line 40
  AIDigest/tests/test_db_role.py Basic Auth Credentials line 147
  AIDigest/tests/test_fetcher.py Basic Auth Credentials line 41
  AIDigest/tests/test_setup_sh.py Basic Auth Credentials line 22
  setup.sh Basic Auth Credentials line 56
```

New since section 11:
- `tests/test_db_role.py:147`: the URL `postgresql+asyncpg://admin:xpostgres@...` in
  `test_as_role_rebuilds_the_url`, a fixture password chosen to contain `postgres@`.
- `caddy-entrypoint.sh` `SENTINEL_HASH`: the same never-matching placeholder hash as section 11.8,
  now in one place instead of compose.

The regex scan of added lines finds only the fixtures and placeholders already triaged in
sections 5, 10 and 11 (the `++` lines are earlier scan output quoted in this file).

### 12.8 Note: `GRANT CONNECT ON DATABASE` needs the owner

With PUBLIC CONNECT revoked, the README's `GRANT CONNECT ON DATABASE <dbname> TO aidigest_app` run
by a non-owner CREATEROLE admin is a silent no-op (`WARNING: no privileges were granted`), and the
app role cannot connect. The test now makes its admin the database owner, and the README says to
run the role SQL as the database owner.

### 12.9 Not re-run

The end-to-end run of section 11.9 was not repeated: this round changes only the Caddy layer
(covered end to end by the matrix with the real Caddy image), Settings/setup.sh validation and
tests.

