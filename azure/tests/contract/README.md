# Contract tests

Quick tests of the Claims API through APIM. They prove that:

- APIM rejects requests without a valid sign-in (401/403 through `validate-azure-ad-token`)
- APIM accepts the agent's Entra token (200)
- The rate limit kicks in when many calls arrive at once
- Responses match the OpenAPI spec in the repo (`connectors/claims-api.openapi.yaml`)
- The `/payout` endpoint requires the human-approval header, so a person approves each payout

## Two modes

- `TEST_MODE=local` — points `CLAIMS_API_BASE_URL` at a Prism mock server built
  from the OpenAPI spec. The sign-in and rate-limit tests are skipped. Useful for
  CI on pull requests (no Azure credentials needed).
- `TEST_MODE=azure` (default) — calls the real APIM URL with a DefaultAzureCredential
  token. Needs the agent's federated identity or `az login`.

### Local mock

```bash
npx --yes @stoplight/prism-cli@5 mock \
  ../workloads/insurance-app/connectors/claims-api.openapi.yaml &
CLAIMS_API_BASE_URL=http://127.0.0.1:4010 TEST_MODE=local pytest -v .
```

### Azure

```bash
export APIM_GATEWAY_URL=$(cd ../workloads/insurance-app && terraform output -raw apim_gateway_url)
export APIM_ENTRA_SCOPE="api://insurance-app-connectors/.default"
pytest -v .
```
