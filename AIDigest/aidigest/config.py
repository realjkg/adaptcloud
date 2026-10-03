"""Settings for AIDigest, read from the environment (pydantic-settings).

Mirrors homeschool-api/core/config.py: with PRODUCTION=true the service refuses
to start when a secret is missing, a placeholder, or too weak."""

import re
from typing import Literal

from pydantic import Field, field_validator, model_validator
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
    aidigest_ai_max_tokens: int = 16_000            # non-streaming safe; room for thinking + 12-item JSON
    aidigest_ai_effort: Literal["low", "medium", "high"] = "medium"
    aidigest_ai_timeout_seconds: float = 240.0
    aidigest_ai_max_concurrency: int = Field(2, ge=1)

    # ── Storage: a dedicated least-privilege role that owns schema "aidigest" (M8) ──
    # postgresql+asyncpg://aidigest_app:pass@host/db?ssl=require
    aidigest_database_url: str = ""

    # ── Auth: shared secret Caddy sends with every proxied request ───────────
    aidigest_proxy_secret: str = ""

    # ── DAILY schedule (UTC, HH:MM) and run bounds ────────────────────────────
    aidigest_daily_time: str = "12:30"
    aidigest_scheduler_enabled: bool = True
    aidigest_daily_budget_seconds: float = Field(900.0, gt=0)     # whole run, incl. fetch + AI
    aidigest_daily_lease_seconds: float = Field(1200.0, gt=0)     # stale-takeover window (> budget)
    aidigest_daily_heartbeat_seconds: float = Field(60.0, gt=0)
    aidigest_daily_max_attempts: int = Field(3, ge=1)             # per UTC day (operator retries)

    # ── TASK bounds ───────────────────────────────────────────────────────────
    aidigest_task_budget_seconds: float = Field(600.0, gt=0)
    aidigest_task_hourly_limit: int = Field(20, ge=1)              # per authenticated user

    # ── Guarded fetcher / parser bounds ───────────────────────────────────────
    aidigest_fetch_max_bytes: int = 1_000_000
    aidigest_fetch_max_redirects: int = 2
    aidigest_fetch_timeout_seconds: float = 15.0                   # per read
    aidigest_fetch_total_seconds: float = 30.0                     # per fetch, all hops
    aidigest_parse_timeout_seconds: float = 10.0

    production: str = "false"

    @field_validator("aidigest_daily_time")
    @classmethod
    def _valid_daily_time(cls, value: str) -> str:
        if not _DAILY_TIME.match(value):
            raise ValueError("AIDIGEST_DAILY_TIME must be HH:MM (24h, UTC)")
        return value

    @model_validator(mode="after")
    def consistent_limits(self) -> "Settings":
        if self.aidigest_daily_lease_seconds <= self.aidigest_daily_budget_seconds:
            raise ValueError("AIDIGEST_DAILY_LEASE_SECONDS must exceed AIDIGEST_DAILY_BUDGET_SECONDS")
        if self.aidigest_daily_heartbeat_seconds >= self.aidigest_daily_lease_seconds:
            raise ValueError("AIDIGEST_DAILY_HEARTBEAT_SECONDS must be shorter than the lease")
        return self

    @model_validator(mode="after")
    def reject_weak_settings_in_production(self) -> "Settings":
        if not self.is_production:
            return self
        problems = []
        key = self.anthropic_api_key
        if not key or _looks_placeholder(key) or "replace_me" in key.lower():
            problems.append("ANTHROPIC_API_KEY is missing or a placeholder")
        url = self.aidigest_database_url
        if not url or url in _PLACEHOLDER_DB_URLS or "replace_me" in url.lower():
            problems.append("AIDIGEST_DATABASE_URL is missing or a placeholder")
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
