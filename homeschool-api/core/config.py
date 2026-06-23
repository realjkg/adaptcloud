from pydantic_settings import BaseSettings
from pydantic import model_validator
from typing import List


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

    # ── WebAuthn ──────────────────────────────────────────────────────────────
    webauthn_rp_id: str = "localhost"
    webauthn_rp_name: str = "Agnus Dei"
    webauthn_origin: str = "http://localhost:5173"

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
    def reject_weak_defaults_in_production(self) -> "Settings":
        if not self.is_production:
            return self
        problems = []
        if self.secret_key in self._WEAK_SECRETS:
            problems.append("SECRET_KEY is set to the default dev value")
        if not self.server_key or self.server_key.startswith("change-me"):
            problems.append("SERVER_KEY is empty or set to a default dev value")
        if problems:
            raise ValueError(
                "Production mode is enabled but insecure defaults are in use: "
                + "; ".join(problems)
            )
        return self

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.production.lower() == "true"

    @property
    def api_docs_enabled(self) -> bool:
        return self.disable_api_docs.lower() != "true"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
