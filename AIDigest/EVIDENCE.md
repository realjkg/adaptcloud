# AIDigest verification evidence

Branch `feat/ai-digest-initial` (PR #60), base `f96765d`. Recorded 2026-10-03.

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
