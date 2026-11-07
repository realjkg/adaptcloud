# Policy-compliance tests

Claims #5, #6, #7 and #12: proves the `ai-agent-governance` initiative is really
**enforced** on the Application Platform management group.

Each fixture under `bad-fixtures/` is a tiny Terraform config that breaks one of
the policies on purpose. `test_policy_denies.py` runs `terraform apply` on each
one and checks that it **fails** with `RequestDisallowedByPolicy`, naming the
expected policy. If a fixture deploys successfully, either the safeguard is gone
or the assignment isn't in enforce mode. Either way, that's the problem to fix.

## Fixtures

| Directory | Violates | Expected denial cites |
|---|---|---|
| `bad-fixtures/openai-public-access/` | `deny-ai-public-network-access` | `aiagent-deny-public-network` |
| `bad-fixtures/unapproved-model/` | `allowed-aoai-model-deployments` | `aiagent-allowed-aoai-models` |
| `bad-fixtures/missing-tags/` | `require-agent-resource-tags` | `aiagent-require-tags` |

## Before you start

- Terraform ≥ 1.6 on PATH.
- `az login` to a subscription **under `alz-application-platform`** (or another
  management group with the initiative assigned in *enforce* mode). The dev-demo
  setup assigns it with `enforcement_mode=DoNotEnforce`. There, compliance is
  recorded but nothing is blocked, so the tests fail, as they should. That's the
  point: they tell enforce mode apart from audit mode.
- The environment variable `AZURE_SUBSCRIPTION_ID` set to the target subscription ID.

## Run

```bash
export AZURE_SUBSCRIPTION_ID=<your-workload-sub>
pytest -v test_policy_denies.py
```

Each fixture creates a throwaway resource group (`rg-e2e-<fixture>-<random>`).
If a test fails, meaning the deploy **succeeded** when it should have been
blocked, the resource group is left in place so you can look at it. If the tests
pass, they run `terraform destroy` to clean up anything partly created.
