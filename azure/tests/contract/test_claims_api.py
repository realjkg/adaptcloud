"""Pillar #4 + #10: custom-connector OpenAPI conformance + human-in-the-loop payout gate.

Proves the Claims API surface matches what the shipped OpenAPI spec advertises
(`azure/workloads/insurance-app/connectors/claims-api.openapi.yaml`) — so the
Power Platform custom connector generated from that spec will actually work.
"""

import uuid
from datetime import date

import pytest
import requests


def _post(url, headers, body, expected=201):
    r = requests.post(url, headers=headers, json=body, timeout=15)
    assert r.status_code == expected, f"{url} -> {r.status_code}: {r.text[:400]}"
    return r


def _get(url, headers, expected=200):
    r = requests.get(url, headers=headers, timeout=15)
    assert r.status_code == expected, f"{url} -> {r.status_code}: {r.text[:400]}"
    return r


@pytest.fixture
def fnol_body():
    return {
        "policyId": f"POL-E2E-{uuid.uuid4().hex[:8]}",
        "lossType": "collision",
        "lossDate": str(date.today()),
        "description": "e2e-test fixture",
        "reportedByUpn": "e2e@adapt.example",
    }


def test_submit_fnol_matches_openapi_shape(
    claims_api_base_url, auth_headers, openapi_spec, fnol_body
):
    r = _post(f"{claims_api_base_url}/claims", auth_headers, fnol_body)
    claim = r.json()
    expected_props = (
        openapi_spec["components"]["schemas"]["Claim"]["properties"].keys()
    )
    # The response must at minimum expose claimId, policyId, state, lossType, lossDate.
    required = {"claimId", "policyId", "state", "lossType", "lossDate"} & set(expected_props)
    missing = required - set(claim.keys())
    assert not missing, f"Claim response missing OpenAPI-declared fields: {missing}"
    assert claim["state"] in {
        "open", "triaging", "in_review", "approved", "denied", "paid", "closed"
    }


def test_list_and_get_roundtrip(claims_api_base_url, auth_headers, fnol_body):
    created = _post(f"{claims_api_base_url}/claims", auth_headers, fnol_body).json()
    fetched = _get(f"{claims_api_base_url}/claims/{created['claimId']}", auth_headers).json()
    assert fetched["claimId"] == created["claimId"]
    assert fetched["policyId"] == created["policyId"]


def test_triage_decision_updates_state(claims_api_base_url, auth_headers, fnol_body):
    created = _post(f"{claims_api_base_url}/claims", auth_headers, fnol_body).json()
    triage = {"severity": "medium", "routingQueue": "auto-adjusters", "fraudScore": 0.12}
    updated = _post(
        f"{claims_api_base_url}/claims/{created['claimId']}/triage",
        auth_headers,
        triage,
        expected=200,
    ).json()
    assert updated["state"] in {"triaging", "in_review"}


def test_payout_requires_human_approval_header(
    claims_api_base_url, auth_headers, fnol_body, test_mode
):
    """Pillar #10: the /payout endpoint MUST refuse a call from the agent alone.

    The APIM inbound policy requires an `X-Human-Approver` header (populated by
    the confirmation topic in Copilot Studio, never by the agent). Calling
    /payout with only the agent's token → 403.
    """
    if test_mode == "local":
        pytest.skip("Prism mock does not enforce the human-approval header")
    created = _post(f"{claims_api_base_url}/claims", auth_headers, fnol_body).json()
    r = requests.post(
        f"{claims_api_base_url}/claims/{created['claimId']}/payout",
        headers=auth_headers,
        json={"amount": 500.0, "currency": "USD"},
        timeout=15,
    )
    assert r.status_code == 403, (
        f"/payout without X-Human-Approver header must be forbidden; got {r.status_code}"
    )


def test_payout_succeeds_with_human_approval_header(
    claims_api_base_url, auth_headers, fnol_body, test_mode
):
    if test_mode == "local":
        pytest.skip("Prism mock always accepts")
    created = _post(f"{claims_api_base_url}/claims", auth_headers, fnol_body).json()
    approved_headers = {**auth_headers, "X-Human-Approver": "approver@adapt.example"}
    r = requests.post(
        f"{claims_api_base_url}/claims/{created['claimId']}/payout",
        headers=approved_headers,
        json={"amount": 500.0, "currency": "USD", "approverUpn": "approver@adapt.example"},
        timeout=15,
    )
    assert r.status_code == 200, f"payout with approver header should succeed; got {r.status_code}"
