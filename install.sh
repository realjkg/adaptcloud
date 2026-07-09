#!/usr/bin/env bash
# Bede Homeschool Tutor — one-time parent setup
# Run this once from the Bede folder to get everything running.
# Usage:  bash install.sh
set -euo pipefail

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
RED='\033[0;31m'; CYAN='\033[0;36m'; DIM='\033[2m'; RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✓${RESET}  $*"; }
info() { echo -e "  ${CYAN}→${RESET}  $*"; }
warn() { echo -e "  ${YELLOW}!${RESET}  $*"; }
fail() { echo -e "\n  ${RED}✗  $*${RESET}\n"; exit 1; }
step() { echo -e "\n${BOLD}$*${RESET}"; }
hr()   { echo -e "${DIM}────────────────────────────────────────────────${RESET}"; }
blank(){ echo ""; }

# ── Banner ────────────────────────────────────────────────────────────────────
blank
hr
echo -e "  ${BOLD}Bede Homeschool Tutor${RESET}"
echo    "  Family setup — takes about 5 minutes the first time"
hr
blank

# ── Must run from the Bede folder ─────────────────────────────────────────────
[[ -f docker-compose.yml ]] || fail "Please open a terminal in the Bede folder and run: bash install.sh"

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OS=$(uname -s)
ARCH=$(uname -m)

# ── Step 1: Docker ────────────────────────────────────────────────────────────
step "Step 1 of 5 — Docker"

if ! command -v docker &>/dev/null; then
    warn "Docker is not installed on this computer."
    blank
    if [[ "$OS" == "Darwin" ]]; then
        # Auto-install via Homebrew → OrbStack (lightweight Docker runtime for Mac)
        if ! command -v brew &>/dev/null; then
            info "Installing Homebrew (package manager for Mac)..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            # Add brew to PATH for Apple Silicon
            if [[ "$ARCH" == "arm64" ]]; then
                eval "$(/opt/homebrew/bin/brew shellenv)"
            fi
            ok "Homebrew installed"
        fi
        info "Installing OrbStack (fast, lightweight Docker for Mac)..."
        brew install --cask orbstack
        # OrbStack starts automatically on install; wait for Docker socket
        info "Waiting for OrbStack to start..."
        DEADLINE=$((SECONDS + 60))
        until docker info &>/dev/null 2>&1; do
            [[ $SECONDS -ge $DEADLINE ]] && fail "OrbStack did not start in time. Open OrbStack from Applications and re-run: bash install.sh"
            printf "."
            sleep 2
        done
        echo ""
        ok "OrbStack is running"
    else
        info "Installing Docker automatically..."
        curl -fsSL https://get.docker.com | sudo sh
        sudo usermod -aG docker "$USER"
        sudo systemctl enable --now docker
        ok "Docker installed"
        warn "You may need to log out and log back in, then re-run: bash install.sh"
        exit 0
    fi
fi

if ! docker info &>/dev/null 2>&1; then
    if [[ "$OS" == "Darwin" ]]; then
        fail "Docker Desktop is not running. Open it from Applications and wait for the whale icon, then try again."
    else
        fail "Docker is not running. Try: sudo systemctl start docker"
    fi
fi

docker compose version &>/dev/null 2>&1 \
    || fail "Docker Compose v2 is required. Please update Docker Desktop and try again."

ok "Docker is ready"

# ── Existing install check ────────────────────────────────────────────────────
if [[ -f .env ]]; then
    blank
    warn "Bede is already set up (.env exists)."
    read -rp "  Start Bede with the existing settings? (Y/n) " REUSE
    if [[ "${REUSE,,}" != "n" ]]; then
        info "Starting Bede with existing settings..."
        docker compose up -d
        blank
        ok "Bede is running. Opening your browser..."
        SITE_URL=$(grep '^SITE_URL=' .env | cut -d'=' -f2-)
        [[ "$OS" == "Darwin" ]] && open "${SITE_URL:-http://localhost}" 2>/dev/null || true
        exit 0
    fi
    cp .env .env.backup
    ok "Previous settings saved to .env.backup"
fi

# ── Step 2: Anthropic API key ─────────────────────────────────────────────────
step "Step 2 of 5 — Claude AI access"
echo "    Bede uses Claude AI to tutor your children."
echo "    You need a free API key from Anthropic."
blank
echo "    Get your key at:  https://console.anthropic.com/"
echo "    (create an account, then click 'API Keys' → 'Create Key')"
blank

while true; do
    read -rsp "  Paste your API key: " ANTHROPIC_API_KEY; blank
    [[ -n "$ANTHROPIC_API_KEY" ]] && break
    warn "An API key is required to continue."
done
ok "API key saved"

# ── Step 3: Network ───────────────────────────────────────────────────────────
step "Step 3 of 5 — Network access"
echo "    Where will family members use Bede?"
blank
echo "    1) Home network  (recommended)"
echo "       Tablets and computers in your house can all connect"
blank
echo "    2) This computer only"
echo "       Only usable from this machine (good for testing)"
blank

while true; do
    read -rp "  Choice (1 or 2) [1]: " NET_CHOICE
    NET_CHOICE="${NET_CHOICE:-1}"
    case "$NET_CHOICE" in
        1)
            blank
            echo "    Give your Bede server a short name (like your family name or 'bede')."
            echo "    Tablets will find it at  https://NAME.local"
            blank
            read -rp "  Server name [bede]: " NET_NAME
            NET_NAME="${NET_NAME:-bede}"
            NET_NAME="${NET_NAME%.local}"      # strip .local if user typed it
            NET_NAME="${NET_NAME,,}"           # lowercase
            NET_NAME="${NET_NAME//[^a-z0-9-]/}" # only URL-safe chars
            [[ -z "$NET_NAME" ]] && NET_NAME="bede"
            SITE_URL="https://${NET_NAME}.local"
            LAN_MODE=true
            break
            ;;
        2)
            SITE_URL="http://localhost"
            NET_NAME="localhost"
            LAN_MODE=false
            break
            ;;
        *)
            warn "Please enter 1 or 2."
            ;;
    esac
done

ok "Bede will be available at: ${SITE_URL}"

# ── mDNS on Linux/Pi (needed for .local names) ────────────────────────────────
if $LAN_MODE && [[ "$OS" == "Linux" ]]; then
    if ! systemctl is-active avahi-daemon &>/dev/null 2>&1; then
        info "Installing mDNS so tablets can find '${NET_NAME}.local'..."
        if command -v apt-get &>/dev/null; then
            sudo apt-get install -y avahi-daemon &>/dev/null
        elif command -v dnf &>/dev/null; then
            sudo dnf install -y avahi nss-mdns &>/dev/null
        fi
        sudo systemctl enable --now avahi-daemon
    fi
    # Set hostname so mDNS broadcasts the right name
    if [[ "$(hostname)" != "$NET_NAME" ]]; then
        sudo hostnamectl set-hostname "$NET_NAME" 2>/dev/null || true
    fi
    ok "Network name configured — tablets can use ${NET_NAME}.local"
fi

# ── Step 4: Data storage ──────────────────────────────────────────────────────
step "Step 4 of 5 — Where to store your data"
echo "    Bede needs to store student profiles, lesson history, and settings."
blank
echo "    1) On this computer  (recommended)"
echo "       Simple, private, no account needed"
echo "       Back up by copying the 'bede-data' folder"
blank
echo "    2) Cloud database  (Neon, Supabase, Railway, or similar)"
echo "       Keeps data safe if this computer fails"
echo "       Requires a free account at one of those services"
blank

while true; do
    read -rp "  Choice (1 or 2) [1]: " DB_CHOICE
    DB_CHOICE="${DB_CHOICE:-1}"
    case "$DB_CHOICE" in
        1)
            DATABASE_URL=""
            ok "Data will be stored on this computer"
            break
            ;;
        2)
            echo "    Format: postgresql+asyncpg://user:pass@host/dbname?ssl=require"
            echo "    (Neon free tier: neon.tech → new project → copy connection string)"
            blank
            while true; do
                read -rp "  Database URL: " DATABASE_URL
                [[ -n "$DATABASE_URL" ]] && break
                warn "Please enter a database URL or choose option 1."
            done
            ok "Cloud database configured"
            break
            ;;
        *)
            warn "Please enter 1 or 2."
            ;;
    esac
done

# ── Step 5: Generate secrets ──────────────────────────────────────────────────
step "Step 5 of 5 — Security keys"
info "Generating unique security keys for your family..."
SECRET_KEY=$(openssl rand -hex 32)
SERVER_KEY=$(openssl rand -hex 32)
ok "Security keys created"

# ── Caddyfile: public domain? ─────────────────────────────────────────────────
# LAN and localhost use existing Caddyfile (local_certs mode).
# Public internet deployments (not .local, not localhost) need Let's Encrypt.
if $LAN_MODE; then
    : # existing Caddyfile is already configured for local_certs + LAN
else
    : # existing Caddyfile handles localhost
fi

# ── Write .env ────────────────────────────────────────────────────────────────
CORS_ORIGINS="${SITE_URL},http://ui:80,http://localhost:5173,http://localhost:80"

cat > .env <<EOF
# Bede Homeschool Tutor — generated by install.sh on $(date -u +"%Y-%m-%d %H:%M UTC")
# Keep this file private — it contains your security keys. Never share or commit it.

ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
SECRET_KEY=${SECRET_KEY}
SERVER_KEY=${SERVER_KEY}
DATABASE_URL=${DATABASE_URL}

# Changing SITE_URL after registering passkeys will require re-enrolling all logins.
SITE_URL=${SITE_URL}

CORS_ORIGINS=${CORS_ORIGINS}
DISABLE_API_DOCS=true
PRODUCTION=true
EOF
chmod 600 .env
ok "Settings saved"

# ── Build and start ───────────────────────────────────────────────────────────
blank
hr
echo ""
info "Building and starting Bede..."
echo    "  (First build downloads AI libraries — takes 3–8 minutes.)"
echo    "  Grab a coffee — you'll only wait this long once."
blank
docker compose up -d --build

# ── Wait for health ───────────────────────────────────────────────────────────
blank
info "Waiting for Bede to finish starting..."

if $LAN_MODE; then
    HEALTH_URL="https://localhost/api/health"
else
    HEALTH_URL="http://localhost/api/health"
fi

DEADLINE=$((SECONDS + 180))
printf "  "
until curl -skf "$HEALTH_URL" >/dev/null 2>&1; do
    if [[ $SECONDS -ge $DEADLINE ]]; then
        blank
        warn "Bede is taking longer than expected to start."
        warn "Check what's happening with:  make logs"
        warn "Or run this script again once the build completes."
        break
    fi
    printf "."
    sleep 4
done
blank
ok "Bede is up and running"

# ── Install HTTPS certificate ─────────────────────────────────────────────────
if $LAN_MODE; then
    blank
    info "Setting up the HTTPS security certificate..."
    sleep 5  # give Caddy a moment to generate it after first start

    if docker compose exec caddy cat /data/pki/authorities/local/root.crt \
            > bede-root-ca.crt 2>/dev/null; then

        if [[ "$OS" == "Darwin" ]]; then
            if sudo security add-trusted-cert -d -r trustRoot \
                    -k /Library/Keychains/System.keychain bede-root-ca.crt 2>/dev/null; then
                ok "Certificate installed — your Mac now trusts Bede's HTTPS"
            else
                warn "Could not auto-install certificate. See tablet setup instructions below."
            fi
        elif [[ -d /usr/local/share/ca-certificates ]]; then
            sudo cp bede-root-ca.crt /usr/local/share/ca-certificates/bede.crt
            sudo update-ca-certificates -f &>/dev/null
            ok "Certificate installed on this Linux system"
        fi
    else
        warn "Certificate not ready yet — run 'make caddy-trust' in a minute."
    fi
fi

# ── Auto-start on reboot ──────────────────────────────────────────────────────
if [[ "$OS" == "Linux" ]]; then
    sudo systemctl enable docker &>/dev/null 2>&1 || true

    # Install systemd service so the compose stack comes up on every boot
    if [[ -f services/bede.service ]]; then
        sed -e "s|BEDE_INSTALL_DIR|${INSTALL_DIR}|g" \
            -e "s|BEDE_USER|${USER}|g" \
            services/bede.service \
            | sudo tee /etc/systemd/system/bede.service &>/dev/null
        sudo systemctl daemon-reload
        sudo systemctl enable bede &>/dev/null
        ok "Bede will start automatically on every reboot"
    fi

elif [[ "$OS" == "Darwin" ]]; then
    # Install launchd agent for boot persistence
    if [[ -f services/com.bede.app.plist ]]; then
        PLIST_DST="${HOME}/Library/LaunchAgents/com.bede.app.plist"
        sed "s|BEDE_INSTALL_DIR|${INSTALL_DIR}|g" \
            services/com.bede.app.plist > "$PLIST_DST"
        launchctl unload "$PLIST_DST" 2>/dev/null || true
        launchctl load "$PLIST_DST" 2>/dev/null && \
            ok "Bede will start automatically when you log in" || \
            warn "Could not register auto-start — start Bede manually with: make start"
    fi
fi

# ── Done ─────────────────────────────────────────────────────────────────────
blank
hr
echo -e "  ${BOLD}${GREEN}Bede is ready!${RESET}"
hr
blank

if $LAN_MODE; then
    echo    "  Open this address in your browser:"
    blank
    echo -e "    ${BOLD}${SITE_URL}${RESET}"
    blank
    echo    "  Tablets (iPad, Android, other computers):"
    echo    "    1. Install the certificate file: bede-root-ca.crt"
    if [[ "$OS" == "Darwin" ]]; then
        echo "       iPad/iPhone:  AirDrop the file → tap it → Settings → install"
        echo "       Android:      Copy the file → Settings → Security → Install cert"
    fi
    echo    "    2. Then open ${SITE_URL} in the browser"
    blank
    echo    "  (Run 'make caddy-trust' any time to get the certificate file again.)"
else
    echo    "  Open this address in your browser:"
    blank
    echo -e "    ${BOLD}${SITE_URL}${RESET}"
fi

blank
echo    "  First time: register your family passkey (Face ID / Touch ID / fingerprint)"
echo    "  Then add each child's profile in the parent menu."
blank
echo    "  Helpful commands:"
echo    "    make status   — check if Bede is running"
echo    "    make logs     — see activity"
echo    "    make stop     — shut down Bede"
echo    "    make start    — start Bede again"
blank
hr
blank

if [[ "$OS" == "Darwin" ]]; then
    open "${SITE_URL}" 2>/dev/null || true
fi
