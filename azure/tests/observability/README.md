# Observability tests

Claim #11: every agent call **can be traced to its Entra Agent ID** in
Application Insights, through the `agentName` custom dimension. If a call happens
and no trace with `agentName` shows up, the audit trail has a gap.

## Prerequisites

- `AGENT_APP_INSIGHTS_ID` — the resource ID of one agent's Application Insights
  component (e.g. `appi-agent-claims-triage-agent`), from
  `terraform output workload_summary`.
- `AGENT_HTTP_ENDPOINT` — a URL the test can POST a made-up query to, which
  makes the agent run. This can be:
  - The **Copilot Studio Direct Line** URL for the published agent (production).
  - A small piece of code (`az functionapp` or a container app) that passes the
    query to Azure OpenAI *and* writes the App Insights trace with `agentName` in
    `customDimensions`. That's the setup the platform expects.
- `az login` (or a managed identity) with the **Log Analytics Reader** role on
  the workspace.

The test checks every 15 seconds for up to 2 minutes. App Insights usually takes
30–60 seconds to show new data, so that leaves plenty of time without waiting
forever.

## Run

```bash
export AGENT_APP_INSIGHTS_ID=/subscriptions/.../components/appi-agent-claims-triage-agent
export AGENT_HTTP_ENDPOINT=https://directline.botframework.com/.../conversations/...
pytest -v test_traces.py
```
