"""Pillar #1-2: agent identity + APIM Entra JWT validation.

The claim: every call to APIM is bound to an Entra identity — no shared keys,
no anonymous access. If someone removes the `validate-azure-ad-token` policy
from `azure/workloads/insurance-app/connectors-apim.tf`, this test fails.
"""

import requests


def test_no_token_is_rejected(claims_api_base_url, test_mode):
    if test_mode == "local":
        # Prism mock has no auth; the interesting test is the Azure one.
        import pytest

        pytest.skip("no auth enforcement in local mock mode")
    r = requests.get(f"{claims_api_base_url}/claims", timeout=10)
    assert r.status_code in (401, 403), (
        f"APIM should reject unauth calls; got {r.status_code}: {r.text[:200]}"
    )


def test_valid_token_is_accepted(claims_api_base_url, auth_headers):
    r = requests.get(f"{claims_api_base_url}/claims", headers=auth_headers, timeout=10)
    assert r.status_code == 200, (
        f"APIM should accept a valid Entra token; got {r.status_code}: {r.text[:200]}"
    )


def test_expired_or_wrong_audience_is_rejected(claims_api_base_url, test_mode):
    if test_mode == "local":
        import pytest

        pytest.skip("no auth enforcement in local mock mode")
    # A structurally-valid JWT with wrong audience — should be rejected by the
    # audience check in the APIM inbound policy.
    fake_jwt = (
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
        "eyJhdWQiOiJhcGk6Ly93cm9uZy1hdWRpZW5jZSIsImV4cCI6MTB9."
        "not-a-real-signature"
    )
    r = requests.get(
        f"{claims_api_base_url}/claims",
        headers={"Authorization": f"Bearer {fake_jwt}"},
        timeout=10,
    )
    assert r.status_code in (401, 403), (
        f"APIM should reject wrong-audience tokens; got {r.status_code}"
    )
