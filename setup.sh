#!/usr/bin/env bash
# Bede Homeschool Tutor — reconfigure wizard
# Usage: bash setup.sh   (or: make setup)
# For first-time installs, use:  bash install.sh
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
DIM='\033[2m'
RESET='\033[0m'

info()    { echo -e "${CYAN}▶  $*${RESET}"; }
success() { echo -e "${GREEN}✓  $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠  $*${RESET}"; }
error()   { echo -e "${RED}✗  $*${RESET}"; exit 1; }
blank()   { echo ""; }
dim()     { echo -e "${DIM}   $*${RESET}"; }

# ── Banner ────────────────────────────────────────────────────────────────────
blank
echo -e "${BOLD}╔═══════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║       Bede Homeschool Tutor — Setup           ║${RESET}"
echo -e "${BOLD}╚═══════════════════════════════════════════════╝${RESET}"
blank

# ── Prerequisites ─────────────────────────────────────────────────────────────
info "Checking prerequisites..."
command -v docker  >/dev/null 2>&1 || error "Docker is not installed. Visit https://docs.docker.com/get-docker/"
command -v openssl >/dev/null 2>&1 || error "openssl is not installed."
docker compose version >/dev/null 2>&1 || error "Docker Compose v2 required. Update Docker Desktop or install the plugin."
success "Docker and Compose found"

# ── Existing .env ─────────────────────────────────────────────────────────────
if [[ -f .env ]]; then
  warn ".env already exists."
  read -rp "   Overwrite it and start fresh? [y/N] " OVERWRITE
  [[ "${OVERWRITE,,}" == "y" ]] || { info "Keeping existing .env. Run 'make start' to launch."; exit 0; }
  cp .env .env.backup
  success "Existing .env backed up to .env.backup"
fi

blank
echo -e "${BOLD}Let's collect the required values.${RESET}"
echo -e "Press Enter to accept defaults where shown."
blank

# ── 1. Anthropic API key ──────────────────────────────────────────────────────
info "1/4  Anthropic (Claude) API key"
dim  "Get yours at: https://console.anthropic.com/"
while true; do
  read -rp "     ANTHROPIC_API_KEY: " ANTHROPIC_API_KEY
  [[ -n "$ANTHROPIC_API_KEY" ]] && break
  warn "This field is required."
done

# ── 2. Database ───────────────────────────────────────────────────────────────
blank
info "2/4  Data storage"
blank
echo "     1) Local storage (default) — SQLite on this machine, stored in Docker volume"
echo "     2) Cloud database          — PostgreSQL (Neon, Supabase, Railway, Render)"
blank
read -rp "     Choice (1 or 2) [1]: " DB_CHOICE
DB_CHOICE="${DB_CHOICE:-1}"

DATABASE_URL=""
if [[ "$DB_CHOICE" == "2" ]]; then
  dim  "Format: postgresql+asyncpg://user:pass@host/dbname?ssl=require"
  while true; do
    read -rp "     DATABASE_URL: " DATABASE_URL
    [[ -n "$DATABASE_URL" ]] && break
    warn "Enter a database URL or choose option 1 for local storage."
  done
  success "Cloud database configured"
else
  success "Using local SQLite storage"
fi

# ── 3. Deployment URL (SITE_URL) ──────────────────────────────────────────────
blank
info "3/4  Deployment URL  (SITE_URL)"
blank
echo -e "     ${BOLD}Choose how this server will be accessed:${RESET}"
blank
echo "     1) localhost only        http://localhost"
echo "        For development and testing on this machine."
blank
echo "     2) Home / LAN network    https://bede.local  (or any hostname.local)"
echo "        Families on your WiFi can connect from tablets."
echo "        Caddy issues a local HTTPS cert — run 'make caddy-trust' once per device."
blank
echo "     3) Public internet       https://agnusdei.ai  (or your domain)"
echo "        Accessible from anywhere; requires a real domain pointed at this server."
blank
warn "IP addresses (e.g. 192.168.1.10) cannot be used — passkeys require a hostname."
dim  "Use option 2 (a .local name) for LAN access instead of a raw IP."
blank

while true; do
  read -rp "     Enter your choice (1/2/3) or type a full URL: " SITE_INPUT

  case "$SITE_INPUT" in
    1)
      SITE_URL="http://localhost"
      break
      ;;
    2)
      read -rp "     Hostname [bede.local]: " LAN_HOST
      LAN_HOST="${LAN_HOST:-bede.local}"
      SITE_URL="https://${LAN_HOST}"
      break
      ;;
    3)
      read -rp "     Domain (e.g. agnusdei.ai): " DOMAIN
      DOMAIN="${DOMAIN#https://}"   # strip scheme if user included it
      DOMAIN="${DOMAIN#http://}"
      SITE_URL="https://${DOMAIN}"
      break
      ;;
    http://localhost*|https://*)
      # User typed a URL directly
      SITE_URL="$SITE_INPUT"
      # Reject IP addresses
      HOST_PART=$(echo "$SITE_URL" | sed 's|https*://||' | sed 's|:.*||' | sed 's|/.*||')
      if [[ "$HOST_PART" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        warn "IP address detected (${HOST_PART}). Passkeys require a hostname."
        warn "Use a .local name (e.g. https://bede.local) or a real domain."
        continue
      fi
      break
      ;;
    *)
      warn "Enter 1, 2, 3, or a full URL starting with http:// or https://"
      ;;
  esac
done

success "SITE_URL = ${SITE_URL}"

# Derive WebAuthn origin and rpId for display
PARSED_SCHEME="${SITE_URL%%://*}"
PARSED_HOST=$(echo "$SITE_URL" | sed 's|https*://||' | sed 's|:.*||' | sed 's|/.*||')

# ── 4. Auto-generate secrets ──────────────────────────────────────────────────
blank
info "4/4  Generating cryptographic secrets..."
SECRET_KEY=$(openssl rand -hex 32)
SERVER_KEY=$(openssl rand -hex 32)
success "SECRET_KEY and SERVER_KEY generated (64 hex chars each)"

# ── Detect LAN IP for CORS (informational) ────────────────────────────────────
LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
CORS_ORIGINS="${SITE_URL},http://ui:80"
if [[ -n "$LAN_IP" && "$SITE_URL" != *"$LAN_IP"* ]]; then
  dim "Detected LAN IP: ${LAN_IP}"
fi
# Always include the Vite dev server origin so npm run dev works
CORS_ORIGINS="${CORS_ORIGINS},http://localhost:5173,http://localhost:80"

# ── Update Caddyfile for public domain deployments ────────────────────────────
if [[ "$PARSED_SCHEME" == "https" && ! "$PARSED_HOST" =~ \.local$ && "$PARSED_HOST" != "localhost" ]]; then
  info "Public domain detected — switching Caddy to Let's Encrypt mode..."
  cat > Caddyfile <<CADDY
{
  # Public internet deployment — Caddy auto-provisions Let's Encrypt certificates.
  # Port 80 and 443 must be reachable from the internet for the ACME challenge.
}

${PARSED_HOST} {
  # API: Caddy → FastAPI directly — skip nginx, flush immediately for SSE streams
  handle_path /api/* {
    reverse_proxy api:8000 {
      header_up Host              {host}
      header_up X-Real-IP         {remote_host}
      header_up X-Forwarded-For   {remote_host}
      header_up X-Forwarded-Proto https
      flush_interval              -1
    }
  }

  # SPA: nginx serves the React bundle and runs the auth_request gate
  handle {
    reverse_proxy ui:80 {
      header_up Host              {host}
      header_up X-Real-IP         {remote_host}
      header_up X-Forwarded-For   {remote_host}
      header_up X-Forwarded-Proto https
    }
  }
}

www.${PARSED_HOST} {
  redir https://${PARSED_HOST}{uri} permanent
}
CADDY
  success "Caddyfile updated for ${PARSED_HOST} (Let's Encrypt)"
else
  # LAN / localhost — keep existing local_certs Caddyfile
  success "Using Caddy local CA (run 'make caddy-trust' on each tablet)"
fi

# ── Write .env ────────────────────────────────────────────────────────────────
blank
info "Writing .env..."
cat > .env <<EOF
# Generated by setup.sh on $(date -u +"%Y-%m-%d %H:%M UTC")
# DO NOT commit this file — it contains secrets.

ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
SECRET_KEY=${SECRET_KEY}
SERVER_KEY=${SERVER_KEY}
DATABASE_URL=${DATABASE_URL}

# Deployment URL — all WebAuthn settings are derived from this.
# Changing this after passkeys are enrolled will break existing credentials.
SITE_URL=${SITE_URL}

CORS_ORIGINS=${CORS_ORIGINS}
DISABLE_API_DOCS=true
PRODUCTION=true
EOF
chmod 600 .env
success ".env written (mode 600)"

# ── Start services ────────────────────────────────────────────────────────────
blank
echo -e "${BOLD}Starting Bede...${RESET}"
docker compose up -d --build

# ── Wait for health ───────────────────────────────────────────────────────────
blank
info "Waiting for the API to become healthy (up to 90 s)..."
DEADLINE=$((SECONDS + 90))

if [[ "$SITE_URL" == "http://localhost"* ]]; then
  HEALTH_URL="http://localhost/api/health"
else
  HEALTH_URL="https://localhost/api/health"
fi

until curl -skf "$HEALTH_URL" >/dev/null 2>&1; do
  if [[ $SECONDS -ge $DEADLINE ]]; then
    warn "API did not respond in time. Check logs with: make logs"
    break
  fi
  printf "."
  sleep 2
done
echo ""

# ── Test WebAuthn configuration ───────────────────────────────────────────────
blank
info "Testing WebAuthn configuration..."
CONFIG_REPORT=$(curl -sk "${HEALTH_URL%/api/health}/api/config" 2>/dev/null || echo '{}')

if echo "$CONFIG_REPORT" | grep -q '"config_valid": *true'; then
  TIER=$(echo "$CONFIG_REPORT" | grep -o '"security_tier": *"[^"]*"' | cut -d'"' -f4)
  NOTE=$(echo "$CONFIG_REPORT" | grep -o '"security_note": *"[^"]*"' | cut -d'"' -f4)
  success "WebAuthn config valid  [tier: ${TIER}]"
  dim "$NOTE"
elif echo "$CONFIG_REPORT" | grep -q '"issues"'; then
  warn "WebAuthn configuration issues detected:"
  echo "$CONFIG_REPORT" | grep -o '"[^"]*"' | grep -v "^\"issues\"\|^\"config_valid\"\|^\"false\"" | head -5
  dim "Full details: curl -sk ${HEALTH_URL%/api/health}/api/config | python3 -m json.tool"
else
  warn "Could not reach /api/config — check logs with: make logs"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
blank
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  Bede is running!${RESET}"
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════${RESET}"
blank

if [[ "$PARSED_HOST" == "localhost" ]]; then
  echo "  Open in your browser:  http://localhost"
elif [[ "$PARSED_HOST" =~ \.local$ ]]; then
  echo "  Open in your browser:  https://${PARSED_HOST}"
  echo "  From tablets:          https://${PARSED_HOST}"
  blank
  echo -e "  ${YELLOW}First-time tablet setup:${RESET}"
  echo "    Run 'make caddy-trust' to get the CA cert, then install it on each"
  echo "    tablet to avoid browser security warnings."
else
  echo "  Open in your browser:  https://${PARSED_HOST}"
fi

blank
echo "  First run: open the URL above and register your family passkey."
echo "  (Face ID / Touch ID will prompt automatically)"
blank
echo "  Useful commands:"
echo "    make status           — check container health"
echo "    make logs             — tail live logs"
echo "    make stop             — shut down"
echo "    curl -sk ${HEALTH_URL%/api/health}/api/config | python3 -m json.tool"
echo "                          — inspect WebAuthn configuration"
blank
