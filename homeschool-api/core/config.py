from pydantic_settings import BaseSettings
from pydantic import model_validator
from typing import List
from urllib.parse import urlparse
import re


def _is_ip(hostname: str) -> bool:
    return bool(re.match(r"^(\d{1,3}\.){3}\d{1,3}$", hostname or ""))


_LAN_TLDS = {".local", ".internal", ".home", ".lan", ".localdomain"}


class Settings(BaseSettings):
    # ── AI models ──────────────────────────────────────────────────────────────
    anthropic_api_key: str = ""
    tutor_model: str = "claude-sonnet-4-6"
    session_model: str = "claude-haiku-4-5-20251001"

    # ── Auth ───────────────────────────────────────────────────────────────────
    secret_key: str = "dev-secret-CHANGE-IN-PRODUCTION-must-be-32-chars-min"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480
    child_token_expire_minutes: int = 240

    # ── Deployment URL (single source of truth for WebAuthn + CORS) ────────────
    # Examples:
    #   http://localhost:5173          → development (same machine only)
    #   https://bede.local             → LAN deployment (Caddy local CA)
    #   https://agnusdei.ai            → production (public domain + TLS)
    #
    # IP addresses (e.g. 192.168.1.10) are NOT valid — WebAuthn requires a
    # hostname as the Relying Party ID. Use a .local mDNS name or real domain.
    site_url: str = ""

    # ── WebAuthn (auto-derived from site_url; override only if needed) ─────────
    webauthn_rp_name: str = "Agnus Dei"
    webauthn_rp_id: str = ""    # leave blank → derived from site_url
    webauthn_origin: str = ""   # leave blank → derived from site_url

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = ""

    # ── Encryption at rest ─────────────────────────────────────────────────────
    server_key: str = ""

    # ── Voice verification thresholds (cosine similarity, 0–1) ───────────────
    voice_threshold_high: float = 0.82
    voice_threshold_medium: float = 0.68

    # ── CORS ──────────────────────────────────────────────────────────────────
    cors_origins: str = "http://localhost:5173,http://localhost:80"

    # ── Production flags ───────────────────────────────────────────────────────
    disable_api_docs: str = "false"
    production: str = "false"

    _WEAK_SECRETS = {
        "dev-secret-CHANGE-IN-PRODUCTION-must-be-32-chars-min",
        "change-me-32-hex-bytes-server-key",
        "",
    }

    @model_validator(mode="after")
    def derive_webauthn_and_validate(self) -> "Settings":
        # 1. Derive origin from site_url if not explicitly set
        if self.site_url and not self.webauthn_origin:
            parsed = urlparse(self.site_url)
            self.webauthn_origin = f"{parsed.scheme}://{parsed.netloc}"

        # 2. Fall back to localhost for development
        if not self.webauthn_origin:
            self.webauthn_origin = "http://localhost:5173"

        # 3. Derive rp_id from origin hostname if not explicitly set
        if not self.webauthn_rp_id:
            hostname = urlparse(self.webauthn_origin).hostname or "localhost"
            self.webauthn_rp_id = hostname

        # 4. Reject IP addresses — WebAuthn spec forbids them as rpId
        if _is_ip(self.webauthn_rp_id):
            raise ValueError(
                f"SITE_URL hostname '{self.webauthn_rp_id}' is an IP address. "
                "WebAuthn requires a hostname as the Relying Party ID. "
                "Use a .local mDNS name (e.g. bede.local) or a real domain."
            )

        # 5. Production guards
        if self.is_production:
            problems = []
            if self.secret_key in self._WEAK_SECRETS:
                problems.append("SECRET_KEY is set to the default dev value")
            if not self.server_key or self.server_key.startswith("change-me"):
                problems.append("SERVER_KEY is empty or set to a default dev value")
            origin_scheme = urlparse(self.webauthn_origin).scheme
            if origin_scheme != "https" and self.webauthn_rp_id != "localhost":
                problems.append(
                    f"SITE_URL must use HTTPS in production (got {origin_scheme!r})"
                )
            if problems:
                raise ValueError(
                    "Production mode is enabled but insecure defaults are in use: "
                    + "; ".join(problems)
                )

        return self

    @property
    def cors_origins_list(self) -> List[str]:
        origins = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        # Always include site_url so the configured deployment URL is allowed
        if self.site_url and self.site_url not in origins:
            origins.append(self.site_url.rstrip("/"))
        if self.webauthn_origin and self.webauthn_origin not in origins:
            origins.append(self.webauthn_origin.rstrip("/"))
        return list(dict.fromkeys(origins))  # deduplicate preserving order

    @property
    def security_tier(self) -> str:
        """Classification used by the config check endpoint."""
        hostname = urlparse(self.webauthn_origin).hostname or ""
        scheme = urlparse(self.webauthn_origin).scheme
        if _is_ip(hostname):
            return "invalid"
        if hostname == "localhost":
            return "localhost"
        if scheme != "https":
            return "invalid"
        if any(hostname.endswith(tld) for tld in _LAN_TLDS):
            return "lan"
        return "production"

    @property
    def is_production(self) -> bool:
        return self.production.lower() == "true"

    @property
    def api_docs_enabled(self) -> bool:
        return self.disable_api_docs.lower() != "true"

    class Config:
        env_file = ".env"
        secrets_dir = "/run/secrets"   # Docker Swarm / Kubernetes secrets mount
        extra = "ignore"


settings = Settings()
