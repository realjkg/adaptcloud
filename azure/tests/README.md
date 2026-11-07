# End-to-end tests: does the architecture do what it says?

Each part of the platform makes a claim. This folder pairs each claim with a test
you can run to prove it. If the test passes, the claim holds; if you remove the
safeguard, the test fails.

## Each claim and the test that proves it

| # | What the platform claims | Proven by |
|---|---|---|
| 1 | Every agent has its **own Entra Agent ID / managed identity** — no shared identities, no keys | [`contract/test_auth.py`](contract/test_auth.py) — unauth call → 401/403; call with the agent's federated token → 200 |
| 2 | APIM **validates the Entra JWT** on every call (`validate-azure-ad-token`) | same |
| 3 | APIM enforces the tenant-wide **rate limit** (`rate-limit calls="600" renewal-period="60"`) | [`contract/test_rate_limit.py`](contract/test_rate_limit.py) — burst 601 calls → some return 429 |
| 4 | Custom connectors match the shipped **OpenAPI contract** (Claims / Policy APIs) | [`contract/test_claims_api.py`](contract/test_claims_api.py) — FNOL → triage → payout, response shapes validated against `connectors/claims-api.openapi.yaml` |
| 5 | **Approved models only** (`allowed-aoai-model-deployments` policy) | [`policy-compliance/bad-fixtures/unapproved-model/`](policy-compliance/bad-fixtures/unapproved-model/) — deploy a `gpt-3.5-turbo` deployment → Azure Policy denies |
| 6 | **No public network access** on AI/PaaS (`deny-ai-public-network-access`) | [`policy-compliance/bad-fixtures/openai-public-access/`](policy-compliance/bad-fixtures/openai-public-access/) — apply an OpenAI account with `publicNetworkAccess=Enabled` → denied |
| 7 | **Required governance tags** on agent resources (`require-agent-resource-tags`) | [`policy-compliance/bad-fixtures/missing-tags/`](policy-compliance/bad-fixtures/missing-tags/) — resource group without `agentOwner`/`dataClassification`/`expiresOn` → denied |
| 8 | Content Safety **Prompt Shields** catch jailbreaks / prompt injection | [`evaluations/jailbreak-refusal.jsonl`](evaluations/jailbreak-refusal.jsonl) — 10 adversarial prompts scored via `ContentSafetyEvaluator` (expected: all refused) |
| 9 | The agent's **domain accuracy** — severity classification, routing queue, fraud flag — is correct | [`evaluations/fnol-triage.jsonl`](evaluations/fnol-triage.jsonl) — 10 labeled FNOL cases scored by the custom `triage_accuracy` metric in [`evaluations/metrics.py`](evaluations/metrics.py) |
| 10 | **Human-in-the-loop** gate on sensitive actions (`/payout`) | [`contract/test_claims_api.py::test_payout_requires_human_approval_header`](contract/test_claims_api.py) — call `/payout` without the `X-Human-Approver` header → 403 from the APIM policy |
| 11 | Every call is **traceable to the agent's Entra Agent ID** in App Insights | [`observability/test_traces.py`](observability/test_traces.py) — send a synthetic prompt, poll App Insights for a trace with `agentName == "claims-triage-agent"` |
| 12 | **The initiative is enforced** on the Application Platform management group | [`policy-compliance/test_policy_denies.py`](policy-compliance/test_policy_denies.py) — runs once for each of the three bad fixtures; each `terraform apply` must fail with `RequestDisallowedByPolicy` |

## The E2E script

[`e2e/run-e2e.sh`](e2e/run-e2e.sh) runs it all, in this order:

1. `terraform apply` the dev-demo profile (workload only, `enable_power_platform=false`)
2. Wait for Azure Policy's first scan of the workload
3. Run the **contract** tests (`pytest tests/contract/`)
4. Run one **eval** (FNOL triage), with the smallest sample, so a full run costs about $0.05 in tokens
5. Run one **jailbreak** eval
6. Run the **observability** trace test (with a 2-minute poll)
7. Run the **policy-compliance** denial tests
8. Print a compliance summary from `az policy state list` for the workload subscription
9. `terraform destroy`

If every step passes, the platform really does what it claims. If step 5 passes but step 8 shows non-compliant resources, a policy doesn't match what the workload built, and you can see exactly which policy without reading a plan.

## Two run modes

- **Local (mock) mode** (no Azure, about 30 seconds): points `CLAIMS_API_BASE_URL`
  at a Prism mock server that follows the OpenAPI spec, and runs only the
  contract tests. This proves *the tests themselves* work and the OpenAPI spec is
  consistent. Useful for CI on pull requests. See [`contract/README.md`](contract/README.md).
- **Azure mode** (a real deployment, about 15 minutes plus tokens): the whole E2E
  script. It runs on `workflow_dispatch` in [`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml)
  and signs in to a sandbox subscription used only for this, through OIDC federation.

## Setup

```bash
cd azure/tests
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Then either run `TEST_MODE=local pytest contract/` (mock), or set the Azure
environment variables (`APIM_GATEWAY_URL`, `APIM_ENTRA_SCOPE`,
`AZURE_SUBSCRIPTION_ID`, `AGENT_APP_INSIGHTS_ID` and others; the full list is in
[`conftest.py`](conftest.py)) and run `bash e2e/run-e2e.sh`.

## What these tests *don't* cover

- They aren't a load test. For APIM sizes, see the guidance in `../COSTS.md`.
- They don't fully measure agent quality. Each evaluation dataset has 10 examples,
  enough to show the format. Aim for 100 or more labeled examples per agent before
  calling it ready for production.
- They aren't a full red-team suite. The jailbreak dataset is a starting point;
  refresh it every quarter with new vulnerabilities and attacks.
