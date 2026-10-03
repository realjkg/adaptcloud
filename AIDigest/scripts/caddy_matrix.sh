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
# Usage: AIDigest/scripts/caddy_matrix.sh [Caddyfile] [docker-compose.yml]
# Needs docker, the caddy:2-alpine image and python3. Exit 0 = all expectations met.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
CADDYFILE=$(realpath "${1:-$HERE/../../Caddyfile}")
COMPOSE=$(realpath "${2:-$HERE/../../docker-compose.yml}")
IMAGE=caddy:2-alpine
PASSWORD="matrix-password-1234567"
WORK=$(mktemp -d)
NET="aidigest-caddy-matrix-$$"
FAILURES=0

cleanup() {
  docker rm -f "caddy-matrix-$$" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

KNOWN_HASH=$(printf '%s\n' "$PASSWORD" | docker run --rm -i "$IMAGE" caddy hash-password --algorithm bcrypt --bcrypt-cost 10 | tr -d '\r\n')
# The repo's `:443 { tls internal }` issues no certificate for an unknown SNI (pre-existing); the probe copy
# adds on_demand issuance so a client inside the network can complete TLS. Nothing else differs.
sed 's/^  tls internal$/  tls internal {\n    on_demand\n  }/' "$CADDYFILE" > "$WORK/Caddyfile"
docker network create "$NET" >/dev/null

caddy_env() {  # $1 user  $2 hash  $3 proxy secret  -> env-file for caddy, as compose renders it
  cat > "$WORK/.env" <<EOF
ANTHROPIC_API_KEY=x
SECRET_KEY=x
MASTER_SECRET=x
PARENT_PASSWORD=x
CHILD_PIN=1234
DATABASE_URL=x
AIDIGEST_BASIC_AUTH_USER=$1
AIDIGEST_BASIC_AUTH_HASH='$2'
AIDIGEST_PROXY_SECRET=$3
EOF
  env -i PATH="$PATH" HOME="$HOME" docker compose -f "$COMPOSE" --env-file "$WORK/.env" config --format json 2>/dev/null \
    | python3 -c '
import json, sys
env = json.load(sys.stdin)["services"]["caddy"].get("environment") or {}
for k, v in sorted(env.items()):
    print(k + "=" + (v or "").replace("$$", "$"))' > "$WORK/caddy.env"
}

probe() {  # $1 user:password or ""  -> HTTP status from inside the network
  local creds=$1 url="https://caddy/aidigest/ops/status"
  [[ -n "$creds" ]] && url="https://${creds}@caddy/aidigest/ops/status"
  docker run --rm --network "$NET" "$IMAGE" sh -c \
    "wget -q -S --no-check-certificate -O /dev/null '$url' 2>&1 | awk '/HTTP\\//{print \$2; exit}'" || true
}

expect() {  # $1 label  $2 expected  $3 actual
  if [[ "$2" == "$3" ]]; then printf '  ok    %-44s %s\n' "$1" "$3"
  else printf '  FAIL  %-44s expected %s got %s\n' "$1" "$2" "$3"; FAILURES=$((FAILURES + 1)); fi
}

run_case() {  # $1 label  $2 user  $3 hash  $4 secret  $5 expected status for ops:$PASSWORD
  echo "== $1"
  caddy_env "$2" "$3" "$4"
  sed 's/=.*$/=<...>/' "$WORK/caddy.env" | sed 's/^/   caddy env: /'
  if docker run --rm --env-file "$WORK/caddy.env" -v "$WORK/Caddyfile:/etc/caddy/Caddyfile:ro" "$IMAGE" \
       caddy adapt --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>"$WORK/adapt.err"; then
    expect "caddy adapt" "adapted" "adapted"
  else
    expect "caddy adapt" "adapted" "ERROR: $(tail -c 160 "$WORK/adapt.err" | tr '\n' ' ')"
    return
  fi
  docker rm -f "caddy-matrix-$$" >/dev/null 2>&1 || true
  docker run -d --name "caddy-matrix-$$" --network "$NET" --network-alias caddy --env-file "$WORK/caddy.env" \
    -v "$WORK/Caddyfile:/etc/caddy/Caddyfile:ro" "$IMAGE" >/dev/null
  sleep 2
  expect "no credentials" 401 "$(probe "")"
  expect "ops:<right password>" "$5" "$(probe "ops:$PASSWORD")"
  expect "aidigest-disabled:<right password>" 401 "$(probe "aidigest-disabled:$PASSWORD")"
  expect "ops:<wrong password>" 401 "$(probe "ops:wrong-password-000")"
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
  expect "no credentials" 401 "$(probe "")"
  expect "aidigest-disabled:<right password>" 401 "$(probe "aidigest-disabled:$PASSWORD")"
  docker rm -f "caddy-matrix-$$" >/dev/null 2>&1 || true
}

SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
run_case "user empty, hash empty"   ""    ""            "$SECRET" 401
run_case "user set,   hash empty"   "ops" ""            "$SECRET" 401
run_case "user empty, hash set"     ""    "$KNOWN_HASH" "$SECRET" 401
run_case "user set,   hash set"     "ops" "$KNOWN_HASH" "$SECRET" 502
run_case "user+hash set, no secret" "ops" "$KNOWN_HASH" ""        401
run_raw_case

echo
if [[ $FAILURES -eq 0 ]]; then echo "caddy matrix: all expectations met"; else echo "caddy matrix: $FAILURES failure(s)"; exit 1; fi
