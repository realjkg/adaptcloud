#!/bin/sh
# Caddy entrypoint (docker-compose "caddy" service).
#
# Caddy is the only ingress for the homeschool UI, so it must start whatever is in the AIDigest
# variables. Caddy refuses to load a basic_auth hash that is neither a "$..." hash string nor valid
# base64, so a hand-edited AIDIGEST_BASIC_AUTH_HASH (or user) could otherwise stop the whole UI.
# Any value that is not well-formed is replaced by the "not configured" sentinel; the Caddyfile
# guard then answers /aidigest/* with 401. The proxy secret is only read at request time
# ({env.AIDIGEST_PROXY_SECRET}) and is validated by the guard, so it is passed through.
# Usage: caddy-entrypoint.sh [run|adapt|validate]   (default: run)
set -eu

SENTINEL_USER=aidigest-disabled
SENTINEL_HASH='$2a$10$UAJZae21lSiIPJHsYElle.vS3Fc.ggO2jGQOn0iy5GlfjR8fa9hvW'

single_line() { case "$1" in *"
"*) return 1 ;; esac; }
valid_user() { single_line "$1" && printf '%s' "$1" | grep -Eqx '[A-Za-z0-9._@-]{1,64}'; }
valid_hash() { single_line "$1" && printf '%s' "$1" | grep -Eqx '[$]2[aby][$][0-9]{2}[$][./A-Za-z0-9]{53}'; }

if ! valid_user "${AIDIGEST_BASIC_AUTH_USER:-}"; then
  export AIDIGEST_BASIC_AUTH_USER="$SENTINEL_USER"
fi
if ! valid_hash "${AIDIGEST_BASIC_AUTH_HASH:-}"; then
  export AIDIGEST_BASIC_AUTH_HASH="$SENTINEL_HASH"
fi

exec caddy "${1:-run}" --config /etc/caddy/Caddyfile --adapter caddyfile
