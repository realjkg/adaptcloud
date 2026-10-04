#!/usr/bin/env bash
# Caddy fail-closed matrix for /aidigest/* (round 2, finding M2).
#
# For every combination of AIDIGEST_BASIC_AUTH_USER / AIDIGEST_BASIC_AUTH_HASH being empty or set
# (plus "both set, proxy secret empty"):
#   1. resolve Caddy's environment exactly as docker compose does from a .env
#   2. `caddy adapt` must succeed (a Caddy that cannot start would take the homeschool UI down)
#   3. start the real Caddy (no aidigest upstream) and probe /aidigest/ops/status:
#        401 = denied by Caddy, 502 = authentication passed (upstream unreachable)
#      Only the fully configured combination with the right password may reach 502.
#
# Caddy is started exactly as docker-compose does: the compose "command" (caddy-entrypoint.sh,
# which sanitises malformed AIDigest values) with the same files mounted.
#
# Usage: AIDigest/scripts/caddy_matrix.sh [Caddyfile] [docker-compose.yml] [caddy-entrypoint.sh]
# Needs docker, the caddy:2-alpine image and python3. Exit 0 = all expectations met.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
CADDYFILE=$(realpath "${1:-$HERE/../../Caddyfile}")
COMPOSE=$(realpath "${2:-$HERE/../../docker-compose.yml}")
ENTRYPOINT=$(realpath "${3:-$HERE/../../caddy-entrypoint.sh}")
EXPECTED_COMMAND='["/bin/sh","/usr/local/bin/caddy-entrypoint.sh"]'

IMAGE=caddy:2-alpine
PASSWORD="matrix-password-1234567"
WORK=$(mktemp -d)
NET="aidigest-caddy-matrix-$$"
FAILURES=0

cleanup() {
  docker rm -f "caddy-matrix-$$" "ui-matrix-$$" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

KNOWN_HASH=$(printf '%s\n' "$PASSWORD" | docker run --rm -i "$IMAGE" caddy hash-password --algorithm bcrypt --bcrypt-cost 10 | tr -d '\r\n')
# The repo's `:443 { tls internal }` issues no certificate for an unknown SNI (pre-existing); the probe copy
# adds on_demand issuance so a client inside the network can complete TLS. Nothing else differs.
sed 's/^  tls internal$/  tls internal {\n    on_demand\n  }/' "$CADDYFILE" > "$WORK/Caddyfile"
caddy_mounts() { echo -v "$WORK/Caddyfile:/etc/caddy/Caddyfile:ro" -v "$ENTRYPOINT:/usr/local/bin/caddy-entrypoint.sh:ro"; }
docker network create "$NET" >/dev/null
# Stand-in for the homeschool UI: every case must keep it reachable (Caddy must never stop).
docker run -d --name "ui-matrix-$$" --network "$NET" --network-alias ui "$IMAGE" \
  caddy respond --listen :80 "homeschool ui" >/dev/null

dotenv_quote() {  # a value as a .env line value: single quotes, or double quotes if it contains one
  if [[ "$1" == *"'"* ]]; then printf '"%s"' "$1"; else printf "'%s'" "$1"; fi
}

caddy_env() {  # $1 user  $2 hash  $3 proxy secret  -> env-file for caddy, as compose renders it
  cat > "$WORK/.env" <<EOF
ANTHROPIC_API_KEY=x
SECRET_KEY=x
MASTER_SECRET=x
PARENT_PASSWORD=x
CHILD_PIN=1234
DATABASE_URL=x
AIDIGEST_BASIC_AUTH_USER=$(dotenv_quote "$1")
AIDIGEST_BASIC_AUTH_HASH=$(dotenv_quote "$2")
AIDIGEST_PROXY_SECRET=$(dotenv_quote "$3")
EOF
  env -i PATH="$PATH" HOME="$HOME" docker compose -f "$COMPOSE" --env-file "$WORK/.env" config --format json \
    > "$WORK/compose.json" 2>"$WORK/compose.err" || return 1
  python3 -c '
import json, sys
env = json.load(sys.stdin)["services"]["caddy"].get("environment") or {}
for k, v in sorted(env.items()):
    print(k + "=" + (v or "").replace("$$", "$"))' < "$WORK/compose.json" > "$WORK/caddy.env"
  python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["services"]["caddy"].get("command"), separators=(",", ":")))' \
    < "$WORK/compose.json" > "$WORK/caddy.command"
}

probe() {  # $1 path  $2 user  $3 password (no user = no credentials) -> HTTP status from inside the network
  local path=$1 header=""
  if [[ -n "${2:-}" || -n "${3:-}" ]]; then
    header="Authorization: Basic $(printf '%s:%s' "$2" "$3" | base64 | tr -d '\n')"
  fi
  docker run --rm --network "$NET" -e "H=$header" -e "URL=https://caddy$path" "$IMAGE" sh -c \
    'if [ -n "$H" ]; then set -- --header "$H"; fi; wget -q -S --no-check-certificate -O /dev/null "$@" "$URL" 2>&1 | awk "/HTTP\\//{print \$2; exit}"' || true
}

expect() {  # $1 label  $2 expected  $3 actual
  if [[ "$2" == "$3" ]]; then printf '  ok    %-44s %s\n' "$1" "$3"
  else printf '  FAIL  %-44s expected %s got %s\n' "$1" "$2" "$3"; FAILURES=$((FAILURES + 1)); fi
}

run_case() {  # $1 label  $2 user  $3 hash  $4 secret  $5 expected status for ops:$PASSWORD
  echo "== $1"
  if ! caddy_env "$2" "$3" "$4"; then
    expect "docker compose config" "rendered" "ERROR: $(tail -c 160 "$WORK/compose.err" | tr '\n' ' ')"; return
  fi
  sed 's/=.*$/=<...>/' "$WORK/caddy.env" | sed 's/^/   caddy env: /'
  expect "compose caddy command" "$EXPECTED_COMMAND" "$(cat "$WORK/caddy.command")"
  # shellcheck disable=SC2046
  if docker run --rm --env-file "$WORK/caddy.env" $(caddy_mounts) "$IMAGE" \
       /bin/sh /usr/local/bin/caddy-entrypoint.sh adapt >/dev/null 2>"$WORK/adapt.err"; then
    expect "caddy adapt (via entrypoint)" "adapted" "adapted"
  else
    expect "caddy adapt (via entrypoint)" "adapted" "ERROR: $(tail -c 160 "$WORK/adapt.err" | tr '\n' ' ')"
    return
  fi
  docker rm -f "caddy-matrix-$$" >/dev/null 2>&1 || true
  # shellcheck disable=SC2046
  docker run -d --name "caddy-matrix-$$" --network "$NET" --network-alias caddy --env-file "$WORK/caddy.env" \
    $(caddy_mounts) "$IMAGE" /bin/sh /usr/local/bin/caddy-entrypoint.sh >/dev/null
  sleep 2
  local user=${2:-ops}
  expect "homeschool UI /" 200 "$(probe / "" "")"
  expect "no credentials" 401 "$(probe /aidigest/ops/status "" "")"
  expect "configured user:<right password>" "$5" "$(probe /aidigest/ops/status "$user" "$PASSWORD")"
  expect "aidigest-disabled:<right password>" 401 "$(probe /aidigest/ops/status aidigest-disabled "$PASSWORD")"
  expect "configured user:<wrong password>" 401 "$(probe /aidigest/ops/status "$user" wrong-password-000)"
  docker rm -f "caddy-matrix-$$" >/dev/null 2>&1 || true
}

run_raw_case() {  # Caddy started outside compose with NO AIDigest variables: Caddyfile defaults apply
  echo "== outside compose, no AIDIGEST_* variables at all"
  if docker run --rm -v "$WORK/Caddyfile:/etc/caddy/Caddyfile:ro" "$IMAGE" \
       caddy adapt --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>"$WORK/adapt.err"; then
    expect "caddy adapt" "adapted" "adapted"
  else
    expect "caddy adapt" "adapted" "ERROR: $(tail -c 160 "$WORK/adapt.err" | tr '\n' ' ')"; return
  fi
  docker rm -f "caddy-matrix-$$" >/dev/null 2>&1 || true
  docker run -d --name "caddy-matrix-$$" --network "$NET" --network-alias caddy \
    -v "$WORK/Caddyfile:/etc/caddy/Caddyfile:ro" "$IMAGE" >/dev/null
  sleep 2
  expect "homeschool UI /" 200 "$(probe / "" "")"
  expect "no credentials" 401 "$(probe /aidigest/ops/status "" "")"
  expect "aidigest-disabled:<right password>" 401 "$(probe /aidigest/ops/status aidigest-disabled "$PASSWORD")"
  docker rm -f "caddy-matrix-$$" >/dev/null 2>&1 || true
}

SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
run_case "user empty, hash empty"   ""    ""            "$SECRET" 401
run_case "user set,   hash empty"   "ops" ""            "$SECRET" 401
run_case "user empty, hash set"     ""    "$KNOWN_HASH" "$SECRET" 401
run_case "user set,   hash set"     "ops" "$KNOWN_HASH" "$SECRET" 502
run_case "user+hash set, no secret" "ops" "$KNOWN_HASH" ""        401
# Round 3 M1: hand-edited values the old Caddyfile split into extra tokens (Caddy exited).
# Each must adapt, keep the UI up, and keep /aidigest/* at 401 unless complete and valid.
run_case "user with a space"            "ops admin" "$KNOWN_HASH" "$SECRET" 401
run_case "user is a single space"       " "         "$KNOWN_HASH" "$SECRET" 401
run_case "user with a double quote"     'o"ps'      "$KNOWN_HASH" "$SECRET" 401
run_case "user with a single quote"     "ops'"      "$KNOWN_HASH" "$SECRET" 401
run_case "user with braces"             "{ops}"     "$KNOWN_HASH" "$SECRET" 401
run_case "user with a backtick"         'o`ps'      "$KNOWN_HASH" "$SECRET" 401
run_case "secret with spaces"           "ops" "$KNOWN_HASH" "correct horse battery staple long passphrase" 401
run_case "secret with \" and braces"     "ops" "$KNOWN_HASH" 'abc"def{ghi}jkl0123456789abcdef0123' 502
run_case "secret with ' and braces"     "ops" "$KNOWN_HASH" "abc'def{env.HOME}0123456789abcdef0123" 502
run_case "hash is not a bcrypt hash"    "ops" "not a bcrypt hash at all" "$SECRET" 401
run_case "hash with a double quote"     "ops" '$2a$10$"broken' "$SECRET" 401
run_case "hash with spaces"             "ops" '$2a$10$ broken hash value' "$SECRET" 401
run_raw_case

echo
if [[ $FAILURES -eq 0 ]]; then echo "caddy matrix: all expectations met"; else echo "caddy matrix: $FAILURES failure(s)"; exit 1; fi
