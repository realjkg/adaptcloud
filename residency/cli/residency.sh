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

gcp_dir() { echo "$ROOT/terraform/providers/gcp"; }
gcp_cluster() { echo "adapt-residency-${ENVIRONMENT}"; }
gcp_project() { [[ -n ${GCP_PROJECT:-} ]] || { echo "GCP_PROJECT is required" >&2; return 2; }; echo "$GCP_PROJECT"; }
gcp_tf() { local cmd=$1; shift; terraform -chdir="$(gcp_dir)" "$cmd" "$@"; }

gcp_doctor() {
  local failed=0 project
  for c in gcloud terraform kubectl docker; do need "$c" || failed=1; done
  (( failed == 0 )) || return 1
  project=$(gcp_project)
  gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q . || { echo "no active gcloud identity" >&2; return 1; }
  gcloud auth application-default print-access-token >/dev/null || { echo "Terraform requires Application Default Credentials; run: gcloud auth application-default login" >&2; return 1; }
  gcloud projects describe "$project" --format='value(projectId)' >/dev/null
  echo "GCP identity: $(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -1)"
  echo "GCP project: $project"
  terraform version | head -1
  kubectl version --client >/dev/null
  docker version >/dev/null
  echo "doctor: GCP prerequisites are ready"
}

gcp_init() { gcp_doctor; gcp_tf init; }
gcp_plan() {
  local project
  project=$(gcp_project)
  gcp_tf plan -var="project_id=$project" -var="environment=${ENVIRONMENT}" -var="region=${GCP_REGION:-us-central1}" -var="zone=${GCP_ZONE:-us-central1-a}" -out="${ENVIRONMENT}.tfplan"
}

gcp_image() {
  local repo tag host
  repo=$(gcp_tf output -raw workload_image_repository)
  host=$(gcp_tf output -raw artifact_registry_host)
  tag=${IMAGE_TAG:-$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD)}
  gcloud auth configure-docker "$host" --quiet
  docker build -t "$repo:$tag" "$REPO_ROOT/insurance-agent-demo/api"
  docker push "$repo:$tag"
  echo "$repo:$tag"
}

gcp_deploy() {
  local project image
  [[ ${ALLOW_BILLABLE:-} == yes ]] || { echo "Refusing billable deployment. Re-run with ALLOW_BILLABLE=yes after reviewing the plan." >&2; exit 3; }
  project=$(gcp_project)
  gcp_tf apply "${ENVIRONMENT}.tfplan"
  gcloud container clusters get-credentials "$(gcp_cluster)" --zone "${GCP_ZONE:-us-central1-a}" --project "$project"
  image=$(gcp_image | tail -1)
  kubectl apply -k "$ROOT/kubernetes/environments/${ENVIRONMENT}"
  kubectl -n applied-ai-residency set image deployment/applied-ai-workload "api=$image"
  kubectl -n applied-ai-residency rollout status deployment/applied-ai-workload --timeout=5m
  echo "deployed immutable Artifact Registry tag: $image"
}

gcp_validate() {
  local project
  project=$(gcp_project)
  gcp_tf validate
  kubectl kustomize "$ROOT/kubernetes/environments/${ENVIRONMENT}" >/dev/null
  if gcloud container clusters describe "$(gcp_cluster)" --zone "${GCP_ZONE:-us-central1-a}" --project "$project" >/dev/null 2>&1; then
    gcloud container clusters get-credentials "$(gcp_cluster)" --zone "${GCP_ZONE:-us-central1-a}" --project "$project" >/dev/null
    kubectl get nodes
    kubectl -n applied-ai-residency get deploy,svc,pods
    kubectl -n applied-ai-residency rollout status deployment/applied-ai-workload --timeout=60s
  else
    echo "static validation complete; no live ${ENVIRONMENT} GKE cluster detected"
  fi
}

gcp_observe() {
  local project
  project=$(gcp_project)
  echo "Health:  kubectl -n applied-ai-residency get pods"
  echo "Logs:    kubectl -n applied-ai-residency logs deployment/applied-ai-workload"
  echo "Events:  kubectl -n applied-ai-residency get events --sort-by=.lastTimestamp"
  echo "GKE:     gcloud container clusters describe $(gcp_cluster) --zone ${GCP_ZONE:-us-central1-a} --project $project"
  echo "Logging: gcloud logging read 'resource.type=k8s_container AND resource.labels.cluster_name=$(gcp_cluster)' --project $project --limit=20"
  echo "Metrics: Google Cloud Monitoring / Managed Service for Prometheus is enabled on the cluster."
  echo "Cost:    Google Cloud Billing reports plus labels project=applied-ai-residency, environment=${ENVIRONMENT}."
  echo "Traces use the shared residency OpenTelemetry layer added after provider parity."
}

gcp_destroy() {
  local project
  project=$(gcp_project)
  echo "Destroying GCP residency environment=${ENVIRONMENT}. Resources outside this Terraform state are not removed."
  kubectl delete -k "$ROOT/kubernetes/environments/${ENVIRONMENT}" --ignore-not-found=true 2>/dev/null || true
  gcp_tf destroy -var="project_id=$project" -var="environment=${ENVIRONMENT}" -var="region=${GCP_REGION:-us-central1}" -var="zone=${GCP_ZONE:-us-central1-a}"
  echo "Post-destroy verification:"
  if gcloud container clusters describe "$(gcp_cluster)" --zone "${GCP_ZONE:-us-central1-a}" --project "$project" >/dev/null 2>&1; then
    echo "cluster still exists" >&2; exit 4
  fi
  echo "GKE cluster no longer resolves. Review Artifact Registry, VPC/NAT, project resources and Billing for anything outside Terraform state."
}

gcp_promote() {
  local from=$ENVIRONMENT to=${4:-}
  valid_env "$to" || { echo "invalid promotion target: $to" >&2; exit 2; }
  echo "Promotion preserves the immutable Artifact Registry image tag/digest. Provision target, then deploy it with IMAGE_TAG set to the source artifact."
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
  gcp:doctor) gcp_doctor;;
  gcp:init) gcp_init;;
  gcp:plan) gcp_plan;;
  gcp:deploy) gcp_deploy;;
  gcp:validate) gcp_validate;;
  gcp:observe) gcp_observe;;
  gcp:destroy) gcp_destroy;;
  gcp:promote) gcp_promote "$@";;
  *) echo "$PROVIDER adapter does not implement $ACTION yet" >&2; exit 5;;
esac
