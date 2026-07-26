"""Runtime configuration for the demo API.

Loaded from environment variables (docker-compose passes them from .env). Two
modes:
  * MODE=local  — no Azure. Uses a canned/deterministic triage response so the
                  demo runs on a laptop with no cloud creds.
  * MODE=azure  — calls the real Azure OpenAI account via DefaultAzureCredential.
                  When the container runs in Azure with a user-assigned managed
                  identity attached, DefaultAzureCredential picks it up — that's
                  the "MSI agent" story the platform advertises.
"""

from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mode: Literal["local", "azure"] = Field(default="local")

    # Azure OpenAI — only required when mode == "azure".
    azure_openai_endpoint: str = Field(default="")
    azure_openai_deployment: str = Field(default="gpt-4o-mini")
    azure_openai_api_version: str = Field(default="2024-10-21")

    # Claims API mock (Prism against azure/workloads/insurance-app/connectors/claims-api.openapi.yaml).
    claims_api_url: str = Field(default="http://prism-mock:4010/claims")

    # CORS: comma-separated list. The Caddy front-end proxies everything under
    # the same origin so this defaults empty.
    cors_origins: str = Field(default="")

    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(default="INFO")


settings = Settings()
