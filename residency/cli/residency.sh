#!/usr/bin/env bash
set -euo pipefail

ACTION=${1:-}
PROVIDER=${2:-}
ENVIRONMENT=${3:-dev}
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

valid_env() { case "$1" in dev|qa|staging|prod) return 0;; *) return 1;; esac; }
need() { command -v "$1" >/dev/null || { echo "missing required CLI: $1" >&2; return 1; }; }

aws_dir() { echo "$ROOT/terraform/providers/aws"; }
aws_cluster() { echo "adapt-residency-${ENVIRONMENT}"; }

aws_doctor() {
  local failed=0
  for c in aws terraform kubectl docker; do need "$c" || failed=1; done
  (( failed == 0 )) || return 1
  aws sts get-caller-identity >/dev/null
  echo "AWS identity: $(aws sts get-caller-identity --query Arn --output text)"
  echo "Terraform: $(terraform version -json | sed -n 's/.*\"terraform_version\":\"\([^\"]*\)\".*/\1/p')"
  kubectl version --client >/dev/null
  docker version >/dev/null
  echo "doctor: AWS prerequisites are ready"
}

aws_tf() {
  local cmd=$1; shift
  terraform -chdir="$(aws_dir)" "$cmd" "$@"
}

aws_init() { aws_doctor; aws_tf init; }
aws_plan() { aws_tf plan -var="environment=${ENVIRONMENT}" -out="${ENVIRONMENT}.tfplan"; }
aws_deploy() {
  [[ ${ALLOW_BILLABLE:-} == yes ]] || { echo "Refusing billable deployment. Re-run with ALLOW_BILLABLE=yes after reviewing the plan." >&2; exit 3; }
  aws_tf apply "${ENVIRONMENT}.tfplan"
  aws eks update-kubeconfig --name "$(aws_cluster)" --region "${AWS_REGION:-us-east-2}"
  kubectl apply -k "$ROOT/kubernetes/environments/${ENVIRONMENT}"
}
aws_validate() {
  aws_tf validate
  kubectl kustomize "$ROOT/kubernetes/environments/${ENVIRONMENT}" >/dev/null
  if aws eks describe-cluster --name "$(aws_cluster)" --region "${AWS_REGION:-us-east-2}" >/dev/null 2>&1; then
    kubectl get nodes
    kubectl -n applied-ai-residency get deploy,svc,pods
  else
    echo "static validation complete; no live ${ENVIRONMENT} EKS cluster detected"
  fi
}
aws_observe() {
  echo "Health: kubectl -n applied-ai-residency get pods"
  echo "Logs:   kubectl -n applied-ai-residency logs deployment/applied-ai-workload"
  echo "Events: kubectl -n applied-ai-residency get events --sort-by=.lastTimestamp"
  echo "AWS:    CloudWatch Container Insights / EKS observability after the provider observability add-on is enabled"
  echo "Cost:   AWS Cost Explorer and resource tags: Project=applied-ai-residency, Environment=${ENVIRONMENT}"
  echo "Traces/metrics/logs use the residency OpenTelemetry contract; provider export is completed in the observability PR."
}
aws_destroy() {
  echo "Destroying AWS residency environment=${ENVIRONMENT}. This does not remove resources created outside this Terraform state."
  kubectl delete -k "$ROOT/kubernetes/environments/${ENVIRONMENT}" --ignore-not-found=true 2>/dev/null || true
  aws_tf destroy -var="environment=${ENVIRONMENT}"
  echo "Post-destroy verification:"
  aws eks describe-cluster --name "$(aws_cluster)" --region "${AWS_REGION:-us-east-2}" >/dev/null 2>&1 && { echo "cluster still exists" >&2; exit 4; } || true
  echo "EKS cluster no longer resolves. Review AWS tagged resources and Cost Explorer for anything outside Terraform state."
}

[[ -n "$ACTION" && -n "$PROVIDER" ]] || { echo "usage: residency.sh <action> <provider> <environment>" >&2; exit 2; }
valid_env "$ENVIRONMENT" || { echo "invalid environment: $ENVIRONMENT" >&2; exit 2; }

case "$PROVIDER:$ACTION" in
  aws:doctor) aws_doctor;;
  aws:init) aws_init;;
  aws:plan) aws_plan;;
  aws:deploy) aws_deploy;;
  aws:validate) aws_validate;;
  aws:observe) aws_observe;;
  aws:destroy) aws_destroy;;
  aws:promote) echo "promotion requires immutable image digest wiring; delivered with the canonical workload PR"; exit 5;;
  *) echo "$PROVIDER adapter does not implement $ACTION yet" >&2; exit 5;;
esac
