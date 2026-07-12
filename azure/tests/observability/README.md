# Observability tests

Pillar #11: every agent call is **traceable to its Entra Agent ID** in
Application Insights via the `agentName` custom dimension. If a call happens
and no trace with `agentName` shows up, the audit trail has a hole.

## Prerequisites

- `AGENT_APP_INSIGHTS_ID` — the resource ID of one agent's Application Insights
  component (e.g. `appi-agent-claims-triage-agent`), from
  `terraform output workload_summary`.
- `AGENT_HTTP_ENDPOINT` — a URL the test can POST a synthetic query to that
  causes the agent to run. This can be:
  - The **Copilot Studio Direct Line** URL for the published agent (production).
  - A minimal code-first shim (`az functionapp` / container app) that forwards
    the query to Azure OpenAI *and* emits the App Insights trace with
    `agentName` in `customDimensions`. That's the pattern the platform assumes.
- `az login` (or a managed identity) with **Log Analytics Reader** at the
  workspace scope.

The test poll window is 2 minutes with 15-second intervals — App Insights
ingestion latency is typically 30-60 seconds, so this is generous but bounded.

## Run

```bash
export AGENT_APP_INSIGHTS_ID=/subscriptions/.../components/appi-agent-claims-triage-agent
export AGENT_HTTP_ENDPOINT=https://directline.botframework.com/.../conversations/...
pytest -v test_traces.py
```
