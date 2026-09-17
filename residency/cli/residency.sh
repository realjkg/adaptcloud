#!/usr/bin/env bash
set -euo pipefail

ACTION=${1:-}
PROVIDER=${2:-}
ENVIRONMENT=${3:-dev}
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
REPO_ROOT=$(cd "$ROOT/.." && pwd)

valid_env() { case "$1" in dev|qa|staging|prod) return 0;; *) return 1;; esac; }
need() { command -v "$1" >/dev/null || { echo "missing required CLI: $1" >&2; return 1; }; }
aws_dir() { echo "$ROOT/terraform/providers/aws"; }
aws_cluster() { echo "adapt-residency-${ENVIRONMENT}"; }
aws_tf() { local cmd=$1; shift; terraform -chdir="$(aws_dir)" "$cmd" "$@"; }

aws_doctor() {
  local failed=0
  for c in aws terraform kubectl docker; do need "$c" || failed=1; done
  (( failed == 0 )) || return 1
  aws sts get-caller-identity >/dev/null
  echo "AWS identity: $(aws sts get-caller-identity --query Arn --output text)"
  terraform version | head -1
  kubectl version --client >/dev/null
  docker version >/dev/null
  echo "doctor: AWS prerequisites are ready"
}

aws_init() { aws_doctor; aws_tf init; }
aws_plan() { aws_tf plan -var="environment=${ENVIRONMENT}" -var="region=${AWS_REGION:-us-east-2}" -out="${ENVIRONMENT}.tfplan"; }

aws_image() {
  local repo tag registry
  repo=$(aws_tf output -raw ecr_repository_url)
  tag=${IMAGE_TAG:-$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD)}
  registry=${repo%%/*}
  aws ecr get-login-password --region "${AWS_REGION:-us-east-2}" | docker login --username AWS --password-stdin "$registry"
  docker build -t "$repo:$tag" "$REPO_ROOT/insurance-agent-demo/api"
  docker push "$repo:$tag"
  echo "$repo:$tag"
}

aws_deploy() {
  [[ ${ALLOW_BILLABLE:-} == yes ]] || { echo "Refusing billable deployment. Re-run with ALLOW_BILLABLE=yes after reviewing the plan." >&2; exit 3; }
  aws_tf apply "${ENVIRONMENT}.tfplan"
  aws eks update-kubeconfig --name "$(aws_cluster)" --region "${AWS_REGION:-us-east-2}"
  local image
  image=$(aws_image | tail -1)
  kubectl apply -k "$ROOT/kubernetes/environments/${ENVIRONMENT}"
  kubectl -n applied-ai-residency set image deployment/applied-ai-workload "api=$image"
  kubectl -n applied-ai-residency rollout status deployment/applied-ai-workload --timeout=5m
  echo "deployed immutable ECR tag: $image"
}

aws_validate() {
  aws_tf validate
  kubectl kustomize "$ROOT/kubernetes/environments/${ENVIRONMENT}" >/dev/null
  if aws eks describe-cluster --name "$(aws_cluster)" --region "${AWS_REGION:-us-east-2}" >/dev/null 2>&1; then
    kubectl get nodes
    kubectl -n applied-ai-residency get deploy,svc,pods
    kubectl -n applied-ai-residency rollout status deployment/applied-ai-workload --timeout=60s
  else
    echo "static validation complete; no live ${ENVIRONMENT} EKS cluster detected"
  fi
}

aws_observe() {
  echo "Health: kubectl -n applied-ai-residency get pods"
  echo "Logs:   kubectl -n applied-ai-residency logs deployment/applied-ai-workload"
  echo "Events: kubectl -n applied-ai-residency get events --sort-by=.lastTimestamp"
  echo "AWS:    CloudWatch Container Insights / EKS observability when enabled"
  echo "Cost:   AWS Cost Explorer and tags Project=applied-ai-residency, Environment=${ENVIRONMENT}"
  echo "Traces/metrics/logs use the residency OpenTelemetry contract; provider export follows in the observability layer."
}

aws_destroy() {
  echo "Destroying AWS residency environment=${ENVIRONMENT}. Resources outside this Terraform state are not removed."
  kubectl delete -k "$ROOT/kubernetes/environments/${ENVIRONMENT}" --ignore-not-found=true 2>/dev/null || true
  aws_tf destroy -var="environment=${ENVIRONMENT}" -var="region=${AWS_REGION:-us-east-2}"
  echo "Post-destroy verification:"
  if aws eks describe-cluster --name "$(aws_cluster)" --region "${AWS_REGION:-us-east-2}" >/dev/null 2>&1; then
    echo "cluster still exists" >&2; exit 4
  fi
  echo "EKS cluster no longer resolves. Review tagged resources and Cost Explorer for resources outside Terraform state."
}

aws_promote() {
  local from=$ENVIRONMENT to=${4:-}
  valid_env "$to" || { echo "invalid promotion target: $to" >&2; exit 2; }
  echo "Promotion preserves an immutable image tag/digest. Provision target first, then set IMAGE_TAG to the source artifact tag and deploy target."
  echo "source=$from target=$to"
}

[[ -n "$ACTION" && -n "$PROVIDER" ]] || { echo "usage: residency.sh <action> <provider> <environment> [target]" >&2; exit 2; }
valid_env "$ENVIRONMENT" || { echo "invalid environment: $ENVIRONMENT" >&2; exit 2; }

case "$PROVIDER:$ACTION" in
  aws:doctor) aws_doctor;;
  aws:init) aws_init;;
  aws:plan) aws_plan;;
  aws:deploy) aws_deploy;;
  aws:validate) aws_validate;;
  aws:observe) aws_observe;;
  aws:destroy) aws_destroy;;
  aws:promote) aws_promote "$@";;
  *) echo "$PROVIDER adapter does not implement $ACTION yet" >&2; exit 5;;
esac
