#!/usr/bin/env bash
# Sage Homeschool Tutor — first-run setup wizard
# Usage: bash setup.sh              (or: make setup)           full first-run setup
#        bash setup.sh --aidigest   (or: make setup-aidigest)  add AIDigest to an existing .env
#                                   (append-only: existing keys are never modified)
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

info()    { echo -e "${CYAN}▶  $*${RESET}"; }
success() { echo -e "${GREEN}✓  $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠  $*${RESET}"; }
error()   { echo -e "${RED}✗  $*${RESET}"; exit 1; }
blank()   { echo ""; }

MODE=full
case "${1:-}" in
  "")         ;;
  --aidigest) MODE=aidigest ;;
  *)          echo "Usage: bash setup.sh [--aidigest]" >&2; exit 2 ;;
esac

# ── AIDigest helpers ──────────────────────────────────────────────────────────
# bcrypt cost 10 (not Caddy's default 14): every failed basic-auth attempt costs a bcrypt
# verification on the shared Caddy, so a lower cost bounds that CPU; a long password
# (16+ chars) keeps offline guessing impractical. See AIDigest/DESIGN.md (L3).
# AIDIGEST_HASH_CMD may be overridden (e.g. offline hashing, tests); it reads the password on stdin.
AIDIGEST_HASH_CMD=${AIDIGEST_HASH_CMD:-docker run --rm -i caddy:2-alpine caddy hash-password --algorithm bcrypt --bcrypt-cost 10}

aidigest_collect() {
  blank
  info "AIDigest (served at https://<host>/aidigest behind Caddy basic auth)"
  IFS= read -rp "     AIDIGEST_BASIC_AUTH_USER [aidigest]: " AIDIGEST_BASIC_AUTH_USER || true
  AIDIGEST_BASIC_AUTH_USER=${AIDIGEST_BASIC_AUTH_USER:-aidigest}
  # Same rule as the service (Settings) and Caddy's guard: 1-64 of A-Z a-z 0-9 . _ @ -
  [[ "$AIDIGEST_BASIC_AUTH_USER" =~ ^[A-Za-z0-9._@-]{1,64}$ ]] \
    || error "User name must be 1-64 characters of letters, digits and . _ @ - (no spaces or quotes)"
  [[ "$AIDIGEST_BASIC_AUTH_USER" != aidigest-disabled ]] || error "'aidigest-disabled' is reserved; choose another user name"
  while true; do
    IFS= read -rsp "     AIDigest password (16+ chars): " AIDIGEST_PASSWORD || error "No password given."; echo
    [[ ${#AIDIGEST_PASSWORD} -ge 16 ]] && break
    warn "Must be at least 16 characters."
  done
  # Hashed by Caddy itself; the password goes over stdin, never on a command line.
  AIDIGEST_BASIC_AUTH_HASH=$(printf '%s\n' "$AIDIGEST_PASSWORD" | bash -c "$AIDIGEST_HASH_CMD") \
    || error "Could not hash the AIDigest password with caddy hash-password."
  unset AIDIGEST_PASSWORD
  AIDIGEST_BASIC_AUTH_HASH=$(printf '%s' "$AIDIGEST_BASIC_AUTH_HASH" | tr -d '\r\n')
  [[ "$AIDIGEST_BASIC_AUTH_HASH" == \$2* ]] || error "Unexpected output from caddy hash-password."
  echo "     AIDigest uses its OWN least-privilege Postgres role (see AIDigest/README.md)."
  echo "     Format: postgresql+asyncpg://aidigest_app:pass@host/dbname?ssl=require"
  while true; do
    IFS= read -rp "     AIDIGEST_DATABASE_URL: " AIDIGEST_DATABASE_URL || error "No AIDIGEST_DATABASE_URL given."
    [[ "$AIDIGEST_DATABASE_URL" == postgresql+asyncpg://* ]] && break
    warn "Must start with postgresql+asyncpg://"
  done
  AIDIGEST_PROXY_SECRET=$(openssl rand -hex 32)
  success "AIDigest password hashed (bcrypt cost 10) and AIDIGEST_PROXY_SECRET generated"
}

# Replace an EMPTY "KEY=" / "KEY=''" / 'KEY=""' line with the new line; every other line is
# copied unchanged. Used for a .env copied from .env.example, whose AIDigest keys are empty.
aidigest_fill_empty() {
  local file=$1 key=$2 newline=$3 tmp l
  tmp=$(mktemp "${file}.aidigest.XXXXXX")   # mktemp creates it mode 600
  trap 'rm -f "$tmp"; exit 130' INT TERM     # never leave a copy of the secrets behind
  while IFS= read -r l || [[ -n "$l" ]]; do
    if [[ "$l" == "${key}=" || "$l" == "${key}=''" || "$l" == "${key}=\"\"" ]]; then
      printf '%s\n' "$newline"
    else
      printf '%s\n' "$l"
    fi
  done < "$file" > "$tmp"
  cat "$tmp" > "$file"   # rewrite in place: keeps the file's inode, owner and mode
  rm -f "$tmp"
  trap - INT TERM
}

# A key that already has a value is never modified; an EMPTY AIDigest key is filled in place;
# a missing key is appended.
aidigest_append() {
  local file=$1 line key header_done=0
  for line in "AIDIGEST_PROXY_SECRET=${AIDIGEST_PROXY_SECRET}" \
              "AIDIGEST_BASIC_AUTH_USER=${AIDIGEST_BASIC_AUTH_USER}" \
              "AIDIGEST_BASIC_AUTH_HASH='${AIDIGEST_BASIC_AUTH_HASH}'" \
              "AIDIGEST_DATABASE_URL=${AIDIGEST_DATABASE_URL}" \
              "COMPOSE_PROFILES=aidigest"; do
    key=${line%%=*}
    if [[ "$key" != COMPOSE_PROFILES ]] && grep -Eq "^${key}=(''|\"\")?\$" "$file"; then
      aidigest_fill_empty "$file" "$key" "$line"
      info "Filled empty ${key}"
      continue
    fi
    if grep -q "^${key}=" "$file"; then
      if [[ "$key" == COMPOSE_PROFILES ]] && ! grep -Eq '^COMPOSE_PROFILES=(.*,)?aidigest(,.*)?$' "$file"; then
        warn "COMPOSE_PROFILES is already set in $file; add 'aidigest' to it by hand (setup.sh never edits existing keys)."
      elif [[ "$key" != COMPOSE_PROFILES ]]; then
        warn "Keeping existing ${key} (not modified)."
      fi
      continue
    fi
    if [[ $header_done -eq 0 ]]; then
      if [[ -s "$file" && -n "$(tail -c1 "$file")" ]]; then printf '\n' >> "$file"; fi
      printf '\n# AIDigest (added by setup.sh on %s)\n' "$(date -u +"%Y-%m-%d %H:%M UTC")" >> "$file"
      header_done=1
    fi
    printf '%s\n' "$line" >> "$file"
  done
}

aidigest_only() {
  [[ -f .env ]] || error ".env not found. Run 'make setup' first."
  command -v openssl >/dev/null 2>&1 || error "openssl is not installed."
  aidigest_collect
  aidigest_append .env
  blank
  success "AIDigest settings added to .env (existing keys untouched)."
  echo "  Next: make aidigest-start   then   make aidigest-status"
  exit 0
}

if [[ "$MODE" == aidigest ]]; then aidigest_only; fi

# ── Banner ────────────────────────────────────────────────────────────────────
blank
echo -e "${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║      Sage Homeschool Tutor — Setup       ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}"
blank

# ── Existing .env (checked first: it needs no prerequisites) ──────────────────
if [[ -f .env ]]; then
  warn ".env already exists."
  echo "   [a] add AIDigest settings only (append-only; existing keys are never changed)"
  echo "   [o] overwrite everything and start fresh"
  echo "   [N] keep it as it is (default)"
  IFS= read -rp "   Choice [a/o/N]: " CHOICE || CHOICE=""
  case "${CHOICE,,}" in
    a) aidigest_only ;;
    o)
      warn "Overwriting regenerates SECRET_KEY and MASTER_SECRET. A new MASTER_SECRET makes every"
      warn "encrypted student record (voice profiles, configs, audit log) PERMANENTLY unreadable."
      IFS= read -rp "   Type OVERWRITE to continue: " CONFIRM || CONFIRM=""
      [[ "$CONFIRM" == "OVERWRITE" ]] || error "Not confirmed; .env left unchanged."
      cp .env .env.backup
      success "Existing .env backed up to .env.backup"
      ;;
    *) info "Keeping existing .env. Run 'make start' to launch."; exit 0 ;;
  esac
fi

# ── Prerequisites ─────────────────────────────────────────────────────────────
info "Checking prerequisites..."
command -v docker >/dev/null 2>&1     || error "Docker is not installed. Visit https://docs.docker.com/get-docker/"
command -v openssl >/dev/null 2>&1    || error "openssl is not installed."
docker compose version >/dev/null 2>&1 || error "Docker Compose v2 is required. Update Docker Desktop or install the plugin."
success "Docker and Compose found"

blank
echo -e "${BOLD}Let's collect the required values.${RESET}"
echo -e "Press Enter to skip optional fields."
blank

# ── Anthropic API key ─────────────────────────────────────────────────────────
info "1/5  Anthropic (Claude) API key"
echo "     Get yours at: https://console.anthropic.com/"
while true; do
  read -rp "     ANTHROPIC_API_KEY: " ANTHROPIC_API_KEY
  [[ -n "$ANTHROPIC_API_KEY" ]] && break
  warn "This field is required."
done

# ── Database URL ──────────────────────────────────────────────────────────────
blank
info "2/5  Managed PostgreSQL database URL"
echo "     Supported providers: Neon (free tier), Supabase, Railway, Render"
echo "     Format: postgresql+asyncpg://user:pass@host/dbname?ssl=require"
while true; do
  read -rp "     DATABASE_URL: " DATABASE_URL
  [[ -n "$DATABASE_URL" ]] && break
  warn "This field is required."
done

# ── Access credentials ────────────────────────────────────────────────────────
blank
info "3/5  Parent password (admin login)"
while true; do
  IFS= read -rsp "     PARENT_PASSWORD: " PARENT_PASSWORD; echo
  [[ ${#PARENT_PASSWORD} -ge 8 ]] && break
  warn "Must be at least 8 characters."
done

blank
info "4/5  Child PIN (student login, 4+ digits)"
while true; do
  read -rp "     CHILD_PIN: " CHILD_PIN
  [[ "$CHILD_PIN" =~ ^[0-9]{4,}$ ]] && break
  warn "Must be 4 or more digits."
done

# ── Auto-generate secrets ─────────────────────────────────────────────────────
blank
info "5/5  Generating cryptographic secrets..."
SECRET_KEY=$(openssl rand -hex 32)
MASTER_SECRET=$(openssl rand -hex 32)
success "SECRET_KEY and MASTER_SECRET generated (64 hex chars each)"

# ── Detect LAN IP for tablet access ──────────────────────────────────────────
LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [[ -n "$LAN_IP" ]]; then
  CORS_ORIGINS="https://localhost,https://${LAN_IP},http://ui:80"
  success "Detected LAN IP: ${LAN_IP} — tablets can reach Sage at https://${LAN_IP}"
else
  CORS_ORIGINS="https://localhost,http://ui:80"
  warn "Could not detect LAN IP. Add it to CORS_ORIGINS in .env if needed."
fi

# ── Write .env ────────────────────────────────────────────────────────────────
blank
info "Writing .env..."
cat > .env <<EOF
# Generated by setup.sh on $(date -u +"%Y-%m-%d %H:%M UTC")
# DO NOT commit this file — it contains secrets.

ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
SECRET_KEY=${SECRET_KEY}
MASTER_SECRET=${MASTER_SECRET}
PARENT_PASSWORD=${PARENT_PASSWORD}
CHILD_PIN=${CHILD_PIN}
DATABASE_URL=${DATABASE_URL}
CORS_ORIGINS=${CORS_ORIGINS}
DISABLE_API_DOCS=true
PRODUCTION=true
EOF
chmod 600 .env
success ".env written (mode 600 — only readable by you)"

# ── Optional: AIDigest ────────────────────────────────────────────────────────
blank
IFS= read -rp "Also set up AIDigest (https://<host>/aidigest)? [y/N] " WANT_AIDIGEST || WANT_AIDIGEST=""
if [[ "${WANT_AIDIGEST,,}" == "y" ]]; then
  aidigest_collect
  aidigest_append .env
fi

# ── Start services ────────────────────────────────────────────────────────────
blank
echo -e "${BOLD}Starting Sage...${RESET}"
docker compose up -d --build

# ── Wait for health ───────────────────────────────────────────────────────────
blank
info "Waiting for the API to become healthy (up to 90 s)..."
DEADLINE=$((SECONDS + 90))
until curl -skf https://localhost/api/health >/dev/null 2>&1; do
  if [[ $SECONDS -ge $DEADLINE ]]; then
    warn "API did not respond in time. Check logs with: make logs"
    break
  fi
  printf "."
  sleep 2
done
echo ""

if curl -skf https://localhost/api/health >/dev/null 2>&1; then
  success "API is healthy!"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
blank
echo -e "${BOLD}${GREEN}══════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  Sage is running!${RESET}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════${RESET}"
blank
echo "  Open in your browser:  https://localhost"
if [[ -n "$LAN_IP" ]]; then
  echo "  From tablets on your network: https://${LAN_IP}"
  echo "  (Run 'make caddy-trust' to install the cert on each tablet — no more warnings)"
fi
echo "  Log in as parent with: PARENT_PASSWORD you just set"
blank
echo "  Useful commands:"
echo "    make status    — check container health"
echo "    make aidigest-status — verify AIDigest readiness (https://localhost/aidigest)"
echo "    make logs      — tail live logs"
echo "    make stop      — shut down"
echo "    make help      — all available commands"
blank
