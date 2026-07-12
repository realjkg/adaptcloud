# Policy-compliance tests

Pillars #5, #6, #7, #12 — proves the `ai-agent-governance` initiative is
actually **enforced** at the Application Platform MG.

Each fixture under `bad-fixtures/` is a tiny Terraform config that deliberately
violates one of the policies. `test_policy_denies.py` runs `terraform apply`
against each and asserts the apply **fails** with `RequestDisallowedByPolicy`
citing the expected policy. If a fixture applies successfully, the guardrail is
gone or the assignment isn't in enforce mode — either way, that's the finding.

## Fixtures

| Directory | Violates | Expected denial cites |
|---|---|---|
| `bad-fixtures/openai-public-access/` | `deny-ai-public-network-access` | `aiagent-deny-public-network` |
| `bad-fixtures/unapproved-model/` | `allowed-aoai-model-deployments` | `aiagent-allowed-aoai-models` |
| `bad-fixtures/missing-tags/` | `require-agent-resource-tags` | `aiagent-require-tags` |

## Prereqs

- Terraform ≥ 1.6 on PATH.
- `az login` against a subscription **under `alz-application-platform`** (or
  another MG with the initiative assigned in *enforce* mode). The dev-demo
  workflow assigns with `enforcement_mode=DoNotEnforce` — you'll see
  compliance-recorded-but-not-denied there and the tests will (correctly)
  fail. That's the point: they distinguish enforce from audit.
- Env var `AZURE_SUBSCRIPTION_ID` = the target subscription id.

## Run

```bash
export AZURE_SUBSCRIPTION_ID=<your-workload-sub>
pytest -v test_policy_denies.py
```

Each fixture creates a throwaway resource group (`rg-e2e-<fixture>-<random>`).
On failure — meaning the apply actually **succeeded** where it should have been
denied — the RG is left behind so you can inspect it. On success, the tests
run `terraform destroy` to clean up any partial state.
