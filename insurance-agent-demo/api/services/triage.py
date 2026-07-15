"""Claims triage service — runs the FNOL narrative through the model and returns
a structured decision, then records it against the Claims API mock.

MODE=local uses a deterministic keyword-based fake so the whole loop works
without cloud creds. MODE=azure calls the deployed Azure OpenAI account via
the MSI (see core.ai_client).
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from ..core.ai_client import get_client
from ..core.config import settings
from . import claims_client

log = logging.getLogger(__name__)

_PROMPT = (Path(__file__).resolve().parent.parent / "prompts" / "triage.md").read_text()

_SEVERITIES = ("low", "medium", "high", "catastrophic")
_QUEUES = (
    "auto-adjusters",
    "bodily-injury-adjusters",
    "major-loss-adjusters",
    "theft-adjusters",
    "special-investigations",
)


def _fake_triage(narrative: str) -> dict[str, Any]:
    """Deterministic offline triage — same shape as the real model output.

    Not accurate — a demo aid. Rough keyword heuristics so the UI shows
    plausible variation without a live model.
    """
    n = narrative.lower()
    fraud = any(w in n for w in ("suspicious", "third claim", "same shop", "after hours", "no witnesses and"))
    if any(w in n for w in ("hospital", "ambulance", "airlifted", "unconscious", "fatal", "pileup")):
        sev, q = "catastrophic", "major-loss-adjusters"
    elif any(w in n for w in ("airbag", "neck pain", "urgent care", "total loss")):
        sev, q = "high", "bodily-injury-adjusters"
    elif "stolen" in n or "theft" in n:
        sev, q = "medium", "theft-adjusters"
    elif fraud:
        sev, q = "medium", "special-investigations"
    else:
        sev, q = "low", "auto-adjusters"
    return {
        "severity": sev,
        "routingQueue": q,
        "fraudFlag": fraud,
        "rationale": f"[local-fake] Keywords suggest {sev} severity for {q}.",
    }


def _extract_json(text: str) -> dict[str, Any]:
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        raise ValueError(f"model returned no JSON: {text[:200]!r}")
    return json.loads(m.group(0))


def _model_triage(narrative: str) -> dict[str, Any]:
    client = get_client()
    assert client is not None, "MODE=azure requested but AzureOpenAI client is None"
    resp = client.chat.completions.create(
        model=settings.azure_openai_deployment,
        messages=[
            {"role": "system", "content": _PROMPT},
            {"role": "user", "content": narrative},
        ],
        temperature=0.0,
        max_tokens=250,
        response_format={"type": "json_object"},
    )
    content = resp.choices[0].message.content or ""
    return _extract_json(content)


def _validate(decision: dict[str, Any]) -> dict[str, Any]:
    if decision.get("severity") not in _SEVERITIES:
        raise ValueError(f"invalid severity: {decision.get('severity')!r}")
    if decision.get("routingQueue") not in _QUEUES:
        raise ValueError(f"invalid routingQueue: {decision.get('routingQueue')!r}")
    if not isinstance(decision.get("fraudFlag"), bool):
        raise ValueError(f"fraudFlag must be bool, got {type(decision.get('fraudFlag'))}")
    decision.setdefault("rationale", "")
    return decision


async def triage(narrative: str) -> dict[str, Any]:
    """Full loop: submit FNOL → run triage → record decision → return combined result."""
    claim = await claims_client.submit_fnol(narrative)

    raw = _fake_triage(narrative) if settings.mode == "local" else _model_triage(narrative)
    decision = _validate(raw)

    try:
        updated = await claims_client.record_triage(
            claim_id=claim["claimId"],
            severity=decision["severity"],
            queue=decision["routingQueue"],
            fraud_flag=decision["fraudFlag"],
        )
    except Exception as e:
        log.warning("record_triage failed against Claims API mock: %s", e)
        updated = claim

    return {
        "mode": settings.mode,
        "claim": updated,
        "decision": decision,
        "prompt_tokens_estimated": len(_PROMPT.split()) + len(narrative.split()),
    }
