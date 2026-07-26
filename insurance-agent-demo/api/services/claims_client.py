"""Thin HTTP client for the Claims API mock (Prism against the shipped OpenAPI).

The demo submits an FNOL to /claims to prove the loop works end-to-end: agent
→ Claims API → triage → decision. Everything hits Prism in the compose stack,
so it's zero-cost and offline-capable.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

import httpx

from ..core.config import settings

log = logging.getLogger(__name__)


async def submit_fnol(narrative: str) -> dict[str, Any]:
    """POST /claims — returns the mocked Claim object."""
    body = {
        "policyId": "POL-DEMO-0001",
        "lossType": "collision",
        "lossDate": date.today().isoformat(),
        "description": narrative[:400],
        "reportedByUpn": "demo@adapt.example",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.post(f"{settings.claims_api_url.rstrip('/')}/claims", json=body)
        r.raise_for_status()
        return r.json()


async def record_triage(claim_id: str, severity: str, queue: str, fraud_flag: bool) -> dict[str, Any]:
    """POST /claims/{id}/triage — writes the agent's decision back to the mock."""
    body = {
        "severity": severity,
        "routingQueue": queue,
        "fraudScore": 0.9 if fraud_flag else 0.05,
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.post(
            f"{settings.claims_api_url.rstrip('/')}/claims/{claim_id}/triage",
            json=body,
        )
        r.raise_for_status()
        return r.json()
