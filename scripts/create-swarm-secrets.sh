#!/usr/bin/env bash
# Push secrets into Docker Swarm. Run once on the manager node.
# Existing secrets are skipped to preserve already-enrolled passkeys.
set -euo pipefail

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; RESET='\033[0m'
info()  { echo -e "${GREEN}▶  $*${RESET}"; }
warn()  { echo -e "${YELLOW}⚠  $*${RESET}"; }
error() { echo -e "${RED}✗  $*${RESET}"; exit 1; }

command -v docker >/dev/null 2>&1 || error "docker not found"
docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null | grep -q "active" \
  || error "Not in a Swarm. Run 'docker swarm init' first."

secret_exists() { docker secret inspect "$1" >/dev/null 2>&1; }

create_or_skip() {
  local name=$1 value=$2
  if secret_exists "$name"; then
    warn "Secret '$name' already exists — skipping (delete with: docker secret rm $name)"
  else
    printf '%s' "$value" | docker secret create "$name" -
    info "Created secret: $name"
  fi
}

echo -e "${BOLD}Bede — Swarm secret setup${RESET}"
echo ""

# ── Anthropic API key ──────────────────────────────────────────────────────────
read -rsp "ANTHROPIC_API_KEY (sk-ant-...): " ANTHROPIC_API_KEY; echo ""
[[ -n "$ANTHROPIC_API_KEY" ]] || error "ANTHROPIC_API_KEY is required"
create_or_skip "anthropic_api_key" "$ANTHROPIC_API_KEY"

# ── Database URL ───────────────────────────────────────────────────────────────
read -rp "DATABASE_URL (postgresql+asyncpg://...): " DATABASE_URL
[[ -n "$DATABASE_URL" ]] || error "DATABASE_URL is required"
create_or_skip "database_url" "$DATABASE_URL"

# ── Site URL ───────────────────────────────────────────────────────────────────
read -rp "SITE_URL (e.g. https://agnusdei.ai): " SITE_URL
[[ -n "$SITE_URL" ]] || error "SITE_URL is required"
create_or_skip "site_url" "$SITE_URL"

# ── Auto-generate crypto secrets ───────────────────────────────────────────────
info "Generating SECRET_KEY and SERVER_KEY..."
create_or_skip "secret_key" "$(openssl rand -hex 32)"
create_or_skip "server_key" "$(openssl rand -hex 32)"

echo ""
echo -e "${BOLD}${GREEN}Secrets created. Deploy with:${RESET}"
echo "  docker stack deploy -c docker-compose.swarm.yml bede"
echo ""
echo "Scale the API layer:"
echo "  docker service scale bede_api=4"
echo ""
echo "Rolling image update:"
echo "  docker service update --image ghcr.io/realjkg/bede-api:v2 bede_api"
