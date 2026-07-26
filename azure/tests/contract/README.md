# Contract tests

Fast tests against the APIM Claims API surface. Prove:

- APIM rejects unauth requests (401/403 via `validate-azure-ad-token`)
- APIM accepts the agent's Entra token (200)
- The rate-limit policy engages under burst
- Responses match the shipped OpenAPI spec (`connectors/claims-api.openapi.yaml`)
- The `/payout` endpoint requires the human-approval header (human-in-the-loop)

## Two modes

- `TEST_MODE=local` — points `CLAIMS_API_BASE_URL` at a Prism mock server
  driven by the OpenAPI spec. Auth / rate-limit tests are skipped. Useful for
  PR CI (no Azure creds needed).
- `TEST_MODE=azure` (default) — hits the real APIM URL with a DefaultAzureCredential
  token. Requires the agent's federated identity or `az login`.

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
