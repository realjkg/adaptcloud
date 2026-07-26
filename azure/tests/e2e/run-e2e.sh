#!/usr/bin/env bash
# End-to-end test orchestration: deploy dev-demo -> run every layer -> destroy.
#
# Each step maps to one architecture pillar (see ../README.md). If any step
# fails, the run stops; a final `terraform destroy` is guaranteed via trap
# so the sandbox doesn't leak resources.
#
# Env vars required:
#   AZURE_SUBSCRIPTION_ID          workload sandbox subscription id
#   ARM_TENANT_ID / ARM_CLIENT_ID  (via `az login` or OIDC federation in CI)
#   APIM_ENTRA_SCOPE               api://insurance-app-connectors/.default
#   AZURE_OPENAI_DEPLOYMENT        gpt-4o-mini (default)
#   AGENT_HTTP_ENDPOINT            (optional) enables observability test
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORKLOAD_DIR="${REPO_ROOT}/azure/workloads/insurance-app"
TESTS_DIR="${REPO_ROOT}/azure/tests"
PROFILE="${REPO_ROOT}/azure/profiles/dev-demo/insurance-app.tfvars"

: "${AZURE_SUBSCRIPTION_ID:?set to workload sandbox subscription id}"
: "${APIM_ENTRA_SCOPE:=api://insurance-app-connectors/.default}"

step() { printf "\n\033[1;36m==> %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m[warn] %s\033[0m\n" "$*"; }

cleanup() {
  local rc=$?
  step "cleanup: terraform destroy"
  ( cd "$WORKLOAD_DIR" && terraform destroy -input=false -auto-approve \
      -var-file="$PROFILE" \
      -var insurance_subscription_id="$AZURE_SUBSCRIPTION_ID" \
      -var central_log_analytics_workspace_id="${LAW_ID:-}" \
      -var ai_agents_group_object_id="${AI_AGENTS_GROUP:-}" \
      -var enable_power_platform=false ) || warn "destroy failed - inspect manually"
  exit $rc
}
trap cleanup EXIT

# 0. Preflight
step "preflight: check terraform + pytest available"
command -v terraform >/dev/null || { echo "terraform not on PATH"; exit 2; }
command -v pytest    >/dev/null || { echo "pytest not on PATH; pip install -r tests/requirements.txt"; exit 2; }

# 1. Apply dev-demo workload (Path A: workload only, Power Platform off)
step "1/8 terraform apply (dev-demo, workload only, enable_power_platform=false)"
cd "$WORKLOAD_DIR"
terraform init -input=false
terraform apply -input=false -auto-approve \
  -var-file="$PROFILE" \
  -var insurance_subscription_id="$AZURE_SUBSCRIPTION_ID" \
  -var central_log_analytics_workspace_id="${LAW_ID:?set LAW_ID to an existing Log Analytics workspace resource id}" \
  -var ai_agents_group_object_id="${AI_AGENTS_GROUP:?set AI_AGENTS_GROUP to an existing Entra security group object id}" \
  -var enable_power_platform=false

APIM_URL=$(terraform output -raw apim_gateway_url)
export APIM_GATEWAY_URL="$APIM_URL"

# 2. Wait for the initial Azure Policy compliance scan (asynchronous).
step "2/8 waiting for policy compliance scan (~60s)"
sleep 60

# 3. Contract tests against real APIM
step "3/8 contract tests"
cd "$TESTS_DIR"
pytest -v contract/

# 4. Triage evaluation
step "4/8 fnol-triage evaluation"
export AZURE_OPENAI_ENDPOINT=$(cd "$WORKLOAD_DIR" && terraform output -raw workload_summary | python3 -c "import sys,json; print(json.load(sys.stdin)['openai_endpoint'])")
python3 evaluations/evaluate.py --dataset evaluations/fnol-triage.jsonl --config evaluations/config.yaml

# 5. Jailbreak refusal evaluation
step "5/8 jailbreak-refusal evaluation"
python3 evaluations/evaluate.py --dataset evaluations/jailbreak-refusal.jsonl --config evaluations/config.yaml

# 6. Observability trace test (optional — only if the agent endpoint is set)
step "6/8 observability trace test"
if [[ -n "${AGENT_HTTP_ENDPOINT:-}" ]]; then
  export AGENT_APP_INSIGHTS_ID=$(cd "$WORKLOAD_DIR" && terraform output -json agent_app_insights | python3 -c "import sys,json; d=json.load(sys.stdin); print(next(iter(d.values())))")
  pytest -v observability/
else
  warn "AGENT_HTTP_ENDPOINT not set — skipping trace test (requires a deployed/published agent)"
fi

# 7. Policy denial tests — try to deploy bad fixtures, expect Azure Policy denials
step "7/8 policy-compliance denial tests"
pytest -v policy-compliance/

# 8. Compliance summary from Azure Resource Graph
step "8/8 compliance summary for the workload subscription"
az policy state summarize \
  --scope "/subscriptions/${AZURE_SUBSCRIPTION_ID}" \
  --query "policyAssignments[?policyAssignmentId=='/providers/microsoft.management/managementgroups/alz-application-platform/providers/microsoft.authorization/policyassignments/aiagent-governance'].results" \
  -o table || warn "compliance summary unavailable (initiative may not be assigned to this sub yet)"

step "e2e: all layers green"
