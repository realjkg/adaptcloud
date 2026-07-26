"""Shared pytest fixtures.

Two run modes controlled by TEST_MODE:
  - "local"  → mock Claims API (Prism against connectors/claims-api.openapi.yaml);
               skips auth/rate-limit tests that need real APIM.
  - "azure"  → real APIM URL and DefaultAzureCredential-issued Entra token.

Env vars consumed:
  TEST_MODE                  local | azure                       (default: azure)
  CLAIMS_API_BASE_URL        override target (defaults to APIM)  (default: APIM_GATEWAY_URL + /claims)
  APIM_GATEWAY_URL           APIM gateway URL from `terraform output workload_summary`
  APIM_ENTRA_SCOPE           e.g. api://insurance-app-connectors/.default
  AZURE_SUBSCRIPTION_ID      workload sub id (policy-compliance + observability tests)
  AGENT_APP_INSIGHTS_ID      /subscriptions/.../components/appi-agent-claims-triage-agent
  APPLICATION_PLATFORM_MG    /providers/Microsoft.Management/managementGroups/alz-application-platform
"""

import os
import pytest


def _mode() -> str:
    return os.environ.get("TEST_MODE", "azure").lower()


@pytest.fixture(scope="session")
def test_mode() -> str:
    return _mode()


@pytest.fixture(scope="session")
def claims_api_base_url() -> str:
    if url := os.environ.get("CLAIMS_API_BASE_URL"):
        return url.rstrip("/")
    apim = os.environ.get("APIM_GATEWAY_URL")
    if not apim:
        pytest.skip("neither CLAIMS_API_BASE_URL nor APIM_GATEWAY_URL set")
    return apim.rstrip("/") + "/claims"


@pytest.fixture(scope="session")
def bearer_token(test_mode: str) -> str:
    """Entra ID access token for the APIM scope. Skipped in local mode."""
    if test_mode == "local":
        pytest.skip("no auth in local mode")
    scope = os.environ.get("APIM_ENTRA_SCOPE")
    if not scope:
        pytest.skip("APIM_ENTRA_SCOPE not set")
    from azure.identity import DefaultAzureCredential

    return DefaultAzureCredential().get_token(scope).token


@pytest.fixture(scope="session")
def auth_headers(bearer_token: str) -> dict:
    return {"Authorization": f"Bearer {bearer_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def openapi_spec() -> dict:
    """Load the shipped Claims API OpenAPI spec (source of truth for shape checks)."""
    import yaml
    from pathlib import Path

    spec_path = (
        Path(__file__).resolve().parents[1]
        / "workloads"
        / "insurance-app"
        / "connectors"
        / "claims-api.openapi.yaml"
    )
    with spec_path.open() as fh:
        return yaml.safe_load(fh)
