#!/usr/bin/env bash
# Bede Homeschool Tutor — Raspberry Pi OS setup
#
# Transforms a fresh Raspberry Pi OS Lite (64-bit, Bookworm) into a
# dedicated Bede server. Run this once after flashing and SSH-ing in.
#
# Usage:
#   bash pi-setup.sh                  # interactive — prompts for API key etc.
#   bash pi-setup.sh --kiosk          # also installs Chromium kiosk on HDMI
#   bash pi-setup.sh --unattended     # non-interactive (reads env vars below)
#
# Unattended env vars:
#   ANTHROPIC_API_KEY   required
#   BEDE_NAME           hostname / mDNS name  (default: bede)
#   DATABASE_URL        optional; empty = SQLite
set -euo pipefail

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
RED='\033[0;31m'; CYAN='\033[0;36m'; DIM='\033[2m'; RESET='\033[0m'
ok()   { echo -e "  ${GREEN}✓${RESET}  $*"; }
info() { echo -e "  ${CYAN}→${RESET}  $*"; }
warn() { echo -e "  ${YELLOW}!${RESET}  $*"; }
fail() { echo -e "\n  ${RED}✗  $*${RESET}\n"; exit 1; }
step() { echo -e "\n${BOLD}$*${RESET}"; }
hr()   { echo -e "${DIM}────────────────────────────────────────────────${RESET}"; }

# ── Parse args ────────────────────────────────────────────────────────────────
KIOSK=false
UNATTENDED=false
for arg in "$@"; do
    case "$arg" in
        --kiosk)      KIOSK=true ;;
        --unattended) UNATTENDED=true ;;
    esac
done

# ── Sanity checks ─────────────────────────────────────────────────────────────
[[ "$(uname -m)" =~ ^(aarch64|armv7l|x86_64)$ ]] || fail "Unsupported architecture: $(uname -m)"
[[ $EUID -ne 0 ]] || fail "Do not run as root. Run as the 'pi' user: bash pi-setup.sh"

hr
echo -e "  ${BOLD}Bede Homeschool Tutor — Raspberry Pi Setup${RESET}"
echo    "  This will configure your Pi as a dedicated Bede server."
hr
echo ""

# ── Step 1: Update system packages ───────────────────────────────────────────
step "Step 1 of 7 — System update"
info "Updating package lists..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq
ok "System up to date"

# ── Step 2: Install Docker ────────────────────────────────────────────────────
step "Step 2 of 7 — Docker"
if command -v docker &>/dev/null; then
    ok "Docker already installed ($(docker --version | cut -d' ' -f3 | tr -d ','))"
else
    info "Installing Docker..."
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker "$USER"
    sudo systemctl enable --now docker
    ok "Docker installed"
fi

if ! docker info &>/dev/null 2>&1; then
    # Activate the new group membership without requiring re-login
    exec sg docker "bash $0 $*"
fi

docker compose version &>/dev/null 2>&1 \
    || fail "Docker Compose v2 is required. Try: sudo apt-get install docker-compose-plugin"
ok "Docker Compose ready"

# ── Step 3: mDNS so tablets find bede.local ──────────────────────────────────
step "Step 3 of 7 — Network name (.local)"
if ! systemctl is-active avahi-daemon &>/dev/null 2>&1; then
    info "Installing Avahi for mDNS..."
    sudo apt-get install -y -qq avahi-daemon libnss-mdns
    sudo systemctl enable --now avahi-daemon
fi
ok "mDNS (Avahi) is running"

# Choose the Bede server name
if $UNATTENDED; then
    BEDE_NAME="${BEDE_NAME:-bede}"
else
    echo ""
    echo "    Tablets will reach Bede at:  https://NAME.local"
    read -rp "  Server name [bede]: " BEDE_NAME
    BEDE_NAME="${BEDE_NAME:-bede}"
fi

BEDE_NAME="${BEDE_NAME%.local}"
BEDE_NAME="${BEDE_NAME,,}"
BEDE_NAME="${BEDE_NAME//[^a-z0-9-]/}"
[[ -z "$BEDE_NAME" ]] && BEDE_NAME="bede"

SITE_URL="https://${BEDE_NAME}.local"

if [[ "$(hostname)" != "$BEDE_NAME" ]]; then
    sudo hostnamectl set-hostname "$BEDE_NAME"
    ok "Hostname set to: $BEDE_NAME"
fi
ok "Bede will be reachable at: $SITE_URL"

# ── Step 4: Anthropic API key ─────────────────────────────────────────────────
step "Step 4 of 7 — Claude AI access"

if $UNATTENDED; then
    [[ -n "${ANTHROPIC_API_KEY:-}" ]] || fail "ANTHROPIC_API_KEY must be set for unattended mode"
else
    echo "    Bede needs a Claude API key from Anthropic."
    echo "    Get one at:  https://console.anthropic.com/"
    echo ""
    while true; do
        read -rsp "  Paste your API key: " ANTHROPIC_API_KEY; echo ""
        [[ -n "$ANTHROPIC_API_KEY" ]] && break
        warn "An API key is required."
    done
fi
ok "API key accepted"

# ── Step 5: Clone / locate Bede ──────────────────────────────────────────────
step "Step 5 of 7 — Bede files"
INSTALL_DIR="${HOME}/bede"

if [[ -d "$INSTALL_DIR/.git" ]]; then
    info "Updating existing Bede installation..."
    git -C "$INSTALL_DIR" pull --ff-only
    ok "Bede files up to date"
elif [[ -f "$(pwd)/docker-compose.yml" ]]; then
    INSTALL_DIR="$(pwd)"
    ok "Using current directory: $INSTALL_DIR"
else
    info "Downloading Bede..."
    git clone --depth 1 https://github.com/realjkg/adaptcloud "$INSTALL_DIR"
    ok "Bede downloaded to: $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ── Step 6: Write .env ────────────────────────────────────────────────────────
step "Step 6 of 7 — Configuration"

SECRET_KEY=$(openssl rand -hex 32)
SERVER_KEY=$(openssl rand -hex 32)
DATABASE_URL="${DATABASE_URL:-}"         # default: SQLite
CORS_ORIGINS="${SITE_URL},http://ui:80,http://localhost:5173"

cat > .env <<EOF
# Bede Homeschool Tutor — Raspberry Pi configuration
# Generated by pi-setup.sh on $(date -u +"%Y-%m-%d %H:%M UTC")
# Keep private — never commit or share this file.

ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
SECRET_KEY=${SECRET_KEY}
SERVER_KEY=${SERVER_KEY}
DATABASE_URL=${DATABASE_URL}

SITE_URL=${SITE_URL}
CORS_ORIGINS=${CORS_ORIGINS}
DISABLE_API_DOCS=true
PRODUCTION=true
EOF
chmod 600 .env
ok "Configuration saved (.env)"

# ── Step 6b: Optional kiosk mode ─────────────────────────────────────────────
if $KIOSK; then
    info "Installing Chromium for kiosk mode..."
    sudo apt-get install -y -qq chromium-browser xorg x11-xserver-utils unclutter

    # Kiosk autostart
    mkdir -p "${HOME}/.config/autostart"
    cat > "${HOME}/.config/autostart/bede-kiosk.desktop" <<KIOSK
[Desktop Entry]
Type=Application
Name=Bede Kiosk
Exec=/bin/bash -c "sleep 15 && chromium-browser --kiosk --noerrdialogs --disable-infobars --no-first-run ${SITE_URL}"
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
KIOSK
    ok "Kiosk mode configured — Chromium will open $SITE_URL on login"
fi

# ── Step 7: Start Bede & install service ─────────────────────────────────────
step "Step 7 of 7 — Starting Bede"
info "Building and starting Bede (first run takes 5-10 minutes on Pi 4)..."
docker compose -f docker-compose.lwa.yml up -d --build

# Install systemd service so Bede starts on every reboot
if [[ -f services/bede.service ]]; then
    sed -e "s|BEDE_INSTALL_DIR|${INSTALL_DIR}|g" \
        -e "s|BEDE_USER|${USER}|g" \
        -e "s|docker compose up -d|docker compose -f docker-compose.lwa.yml up -d|g" \
        services/bede.service \
        | sudo tee /etc/systemd/system/bede.service &>/dev/null
    sudo systemctl daemon-reload
    sudo systemctl enable bede
    ok "Bede will start automatically on every reboot"
fi

# Wait for health endpoint
info "Waiting for Bede to become ready..."
DEADLINE=$((SECONDS + 300))
printf "  "
until curl -skf "https://localhost/api/health" >/dev/null 2>&1; do
    if [[ $SECONDS -ge $DEADLINE ]]; then
        echo ""
        warn "Still starting — check progress with: docker compose -f docker-compose.lwa.yml logs -f"
        break
    fi
    printf "."
    sleep 5
done
echo ""

# Export Caddy CA cert for tablets
if docker compose -f docker-compose.lwa.yml exec caddy \
        cat /data/pki/authorities/local/root.crt > bede-root-ca.crt 2>/dev/null; then
    if [[ -d /usr/local/share/ca-certificates ]]; then
        sudo cp bede-root-ca.crt /usr/local/share/ca-certificates/bede.crt
        sudo update-ca-certificates -f &>/dev/null
    fi
    ok "HTTPS certificate saved: bede-root-ca.crt"
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
hr
echo -e "  ${BOLD}${GREEN}Bede is ready on your Raspberry Pi!${RESET}"
hr
echo ""
echo    "  Open in a browser on any device on your network:"
echo -e "    ${BOLD}${SITE_URL}${RESET}"
echo ""
echo    "  On each tablet (iPad, Android, other computers):"
echo    "    1. Copy bede-root-ca.crt to the device"
echo    "    2. Install it as a trusted CA certificate"
echo    "    3. Then open ${SITE_URL}"
echo ""
echo    "  Helpful commands:"
echo    "    make status   — health check"
echo    "    make logs     — view logs"
echo    "    make stop     — shut down"
if $KIOSK; then
    echo ""
    echo    "  Kiosk: connect a monitor and reboot — Chromium will open Bede automatically."
fi
echo ""
hr
echo ""
