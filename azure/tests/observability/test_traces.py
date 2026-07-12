"""Pillar #11: every agent call is traceable to its Entra Agent ID.

The agent (Copilot Studio or code-first) is expected to emit an Application
Insights trace with a `agentName` custom dimension when it handles a request.
This test sends a synthetic prompt through the agent's endpoint, then polls
App Insights for that trace within a bounded window. If the trace is missing
— or missing the `agentName` dimension — the observability wiring is broken
and audits will be blind.
"""

from __future__ import annotations

import os
import time
import uuid

import pytest

POLL_SECONDS = 120
POLL_INTERVAL = 15


@pytest.fixture(scope="session")
def app_insights_id() -> str:
    v = os.environ.get("AGENT_APP_INSIGHTS_ID")
    if not v:
        pytest.skip("AGENT_APP_INSIGHTS_ID not set")
    return v


@pytest.fixture(scope="session")
def agent_endpoint() -> str:
    v = os.environ.get("AGENT_HTTP_ENDPOINT")
    if not v:
        pytest.skip("AGENT_HTTP_ENDPOINT not set — how would the agent be invoked?")
    return v


def _query_app_insights(app_insights_id: str, correlation_id: str) -> list[dict]:
    """Return rows from the traces table matching our correlation id."""
    from azure.identity import DefaultAzureCredential
    from azure.monitor.query import LogsQueryClient, LogsQueryStatus

    client = LogsQueryClient(DefaultAzureCredential())
    query = f"""
        union traces, dependencies, requests
        | where customDimensions.correlationId == '{correlation_id}'
        | project timestamp, itemType, name, agentName = tostring(customDimensions.agentName)
    """
    r = client.query_resource(app_insights_id, query, timespan=None)
    if r.status != LogsQueryStatus.SUCCESS or not r.tables:
        return []
    table = r.tables[0]
    cols = [c.name for c in table.columns]
    return [dict(zip(cols, row)) for row in table.rows]


def test_agent_trace_carries_agent_name(app_insights_id, agent_endpoint):
    import requests

    correlation_id = f"e2e-{uuid.uuid4().hex}"
    r = requests.post(
        agent_endpoint,
        headers={
            "Content-Type": "application/json",
            "X-Correlation-Id": correlation_id,
        },
        json={"query": "Test FNOL: minor bumper damage, no injuries."},
        timeout=30,
    )
    assert r.status_code < 500, f"agent endpoint 5xx'd: {r.status_code}"

    deadline = time.monotonic() + POLL_SECONDS
    while time.monotonic() < deadline:
        rows = _query_app_insights(app_insights_id, correlation_id)
        if rows:
            break
        time.sleep(POLL_INTERVAL)
    else:
        pytest.fail(
            f"no trace in App Insights within {POLL_SECONDS}s for correlationId={correlation_id}. "
            "Either the agent isn't emitting telemetry or the workspace_id / component id is wrong."
        )

    agent_names = {r["agentName"] for r in rows if r.get("agentName")}
    assert agent_names, (
        "trace found but no `agentName` custom dimension — every agent SHOULD tag "
        "its telemetry with agentName so calls correlate to the Entra Agent ID. "
        f"Rows: {rows[:3]}"
    )
    assert len(agent_names) == 1, (
        f"multiple agentName values in one correlation window — bleed between "
        f"agents: {agent_names}"
    )
