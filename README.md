# Bede — Catholic Charlotte Mason Homeschool AI Tutor

Bede is a self-hosted AI tutor for Catholic homeschool families following the Charlotte Mason method. Parents configure each child's daily plan; children connect from their own tablets. Claude (in the Bede persona) tutors through Socratic dialogue, narration prompts, and subject-specific personas.

**Part of the [Agnus Dei](https://agnusdei.ai) family of educational tools.**

---

## Features

- **Passkey authentication** — Face ID / Touch ID for parents; voice biometric verification for children
- **Charlotte Mason method** — living books, narration, nature study, composer study, picture study, copywork
- **Catholic Classical curriculum** — Faith and Life Series, Baltimore Catechism, Latina Christiana, saints integration
- **4th grade catalog** — Memoria Press, AmblesideOnline, Apologia, Ignatius Press resources wired into Bede's subject prompts
- **Agentic tools** — `request_narration`, `offer_socratic_hint`, `celebrate_discovery`, `connect_to_faith`
- **AES-256-GCM encryption** — all student data encrypted at rest; database provider never sees plaintext
- **LAN deployment** — runs on your home network; tablets connect via `https://bede.local`
- **Raspberry Pi ready** — Lightweight Agent (LWA) build runs on Pi 4 with reduced memory footprint
- **Docker Swarm** — optional cluster deployment for larger pods with rolling updates and encrypted overlay networking

---

## Quick Start

### Parent-friendly installer (Mac / Linux / Pi)

```bash
git clone https://github.com/realjkg/agnusdei
cd agnusdei/bede
bash install.sh
```

The installer handles Docker, generates security keys, configures mDNS, and opens your browser when ready.

### Raspberry Pi

```bash
bash pi-setup.sh          # interactive setup
bash pi-setup.sh --kiosk  # + Chromium kiosk on HDMI display
```

### Day-to-day

```bash
make start    # start Bede
make stop     # stop Bede
make status   # health check + last 20 log lines
make logs     # tail all service logs
make lwa      # start Lightweight Agent build (Pi / low-power hardware)
```

---

## Architecture

```
Caddy (TLS/443) → nginx (UI/80) → FastAPI (API/8000)
```

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Tailwind (Vite) |
| Backend | FastAPI + async SQLAlchemy |
| Auth | WebAuthn passkeys (parent) + voice biometrics (child) |
| AI | Claude via Anthropic API (streaming SSE) |
| Storage | SQLite (default) or PostgreSQL |
| TLS | Caddy local CA — tablets need root cert installed once |

### AI Models

| Role | Model |
|---|---|
| Tutor (streaming) | `claude-sonnet-4-6` |
| Session summary | `claude-haiku-4-5-20251001` |
| LWA (Pi) — both | `claude-haiku-4-5-20251001` |

---

## Project Structure

```
bede/
├── homeschool-api/       FastAPI backend
│   ├── core/             config, database, encryption, auth, middleware
│   ├── routers/          auth, tutor, pod, voice, admin, narration
│   ├── services/         ai_service, voice_auth, transcription, catalog
│   ├── data/catalog/     year1–year4.json curriculum catalogs
│   └── main.py
├── homeschool-tutor/     React + TypeScript frontend
│   └── src/
│       ├── pages/        Login, ParentSetup, PodDashboard, TutorSession, Progress
│       ├── components/   SocraticChat, VoiceVerification, SubjectNav, …
│       └── store/        Zustand session store
├── bede-desktop/         Electron wrapper (local desktop mode, stdio API)
├── services/             systemd (Linux/Pi) and launchd (macOS) service files
├── scripts/              Docker Swarm secret provisioning
├── docker-compose.yml    Standard deployment
├── docker-compose.lwa.yml  Lightweight Agent (Pi)
├── docker-compose.swarm.yml  Cluster deployment
├── Caddyfile             TLS termination + reverse proxy config
├── install.sh            Parent-friendly one-command installer
├── pi-setup.sh           Raspberry Pi OS first-time setup
└── Makefile              All day-to-day commands
```

---

## Security

- Passkeys are IP + User-Agent fingerprinted at issuance — replaying from a different device returns 401
- All student data columns stored as AES-256-GCM `BYTEA` — PBKDF2 → KEK → DATA_KEY hierarchy
- `ExfiltrationGuard` middleware strips prompt-injection markers from SSE streams
- Containers run `read_only: true`, `cap_drop: ALL`, non-root `bede` user
- Docker Swarm overlay network uses `encrypted: true` (AES-256 in-transit)
- `.env` is gitignored — never committed

---

## Required Environment Variables

Set via `install.sh` (interactive) or manually in `.env`:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API access |
| `SECRET_KEY` | JWT signing (32 hex bytes) |
| `SERVER_KEY` | AES key derivation root (32 hex bytes) |
| `SITE_URL` | Deployment URL — WebAuthn `rp_id` derives from this hostname |
| `DATABASE_URL` | PostgreSQL connection string (leave empty to use local SQLite) |

See `.env.example` for the full list.

---

## License

GNU Affero General Public License v3.0 — see [LICENSE](LICENSE).

Free for families to self-host. If you run a modified version as a hosted service, AGPL requires you to publish your modifications.

For commercial licensing inquiries, contact [agnusdei.ai](https://agnusdei.ai).
