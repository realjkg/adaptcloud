"""Settings for AIDigest, read from the environment (pydantic-settings).

Mirrors homeschool-api/core/config.py: with PRODUCTION=true the service refuses
to start when a secret is missing, a placeholder, or too weak."""

import re

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_PLACEHOLDER_MARKERS = ("replace", "change-me", "changeme", "example", "...", "your-")
_PLACEHOLDER_DB_URLS = {
    "postgresql+asyncpg://user:password@host/dbname?ssl=require",
    "postgresql+asyncpg://REPLACE_ME",
}
_DAILY_TIME = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
MIN_PROXY_SECRET_LEN = 32


def _looks_placeholder(value: str) -> bool:
    lowered = value.lower()
    return any(marker in lowered for marker in _PLACEHOLDER_MARKERS)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── Claude ────────────────────────────────────────────────────────────────
    anthropic_api_key: str = ""
    aidigest_model: str = "claude-sonnet-5-5"
    aidigest_ai_max_tokens: int = 8000
    aidigest_ai_timeout_seconds: float = 300.0

    # ── Storage ───────────────────────────────────────────────────────────────
    # postgresql+asyncpg://user:pass@host/db?ssl=require  (tables live in schema "aidigest")
    database_url: str = ""

    # ── Auth: shared secret Caddy sends with every proxied request ───────────
    aidigest_proxy_secret: str = ""

    # ── DAILY schedule (UTC, HH:MM) ───────────────────────────────────────────
    aidigest_daily_time: str = "12:30"
    aidigest_scheduler_enabled: bool = True

    # ── Guarded fetcher bounds ────────────────────────────────────────────────
    aidigest_fetch_max_bytes: int = 1_000_000
    aidigest_fetch_max_redirects: int = 2
    aidigest_fetch_timeout_seconds: float = 15.0

    production: str = "false"

    @field_validator("aidigest_daily_time")
    @classmethod
    def _valid_daily_time(cls, value: str) -> str:
        if not _DAILY_TIME.match(value):
            raise ValueError("AIDIGEST_DAILY_TIME must be HH:MM (24h, UTC)")
        return value

    @model_validator(mode="after")
    def reject_weak_settings_in_production(self) -> "Settings":
        if not self.is_production:
            return self
        problems = []
        key = self.anthropic_api_key
        if not key or _looks_placeholder(key) or "replace_me" in key.lower():
            problems.append("ANTHROPIC_API_KEY is missing or a placeholder")
        url = self.database_url
        if not url or url in _PLACEHOLDER_DB_URLS or "replace_me" in url.lower():
            problems.append("DATABASE_URL is missing or a placeholder")
        secret = self.aidigest_proxy_secret
        if len(secret) < MIN_PROXY_SECRET_LEN or _looks_placeholder(secret):
            problems.append(
                f"AIDIGEST_PROXY_SECRET must be at least {MIN_PROXY_SECRET_LEN} random characters "
                "(openssl rand -hex 32)"
            )
        if problems:
            raise ValueError("Production mode is enabled but settings are insecure: " + "; ".join(problems))
        return self

    @property
    def is_production(self) -> bool:
        return self.production.lower() == "true"

    @property
    def daily_hour(self) -> int:
        return int(self.aidigest_daily_time.split(":")[0])

    @property
    def daily_minute(self) -> int:
        return int(self.aidigest_daily_time.split(":")[1])
