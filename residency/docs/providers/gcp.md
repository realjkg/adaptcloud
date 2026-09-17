# GCP / GKE Residency Path

This path teaches the same residency lifecycle as AWS while using Google Cloud primitives: `gcloud`, Artifact Registry, VPC-native GKE, Workload Identity Federation for GKE, Cloud Logging/Monitoring and Google Cloud Billing. The workload and Kubernetes manifests remain provider-neutral.

> This lab provisions billable resources. `deploy` is gated by `ALLOW_BILLABLE=yes`. Always finish with **Destroy and verify**.

## 1. Account and project prerequisites

Use a student-owned Google Cloud account and project with billing enabled. Do not use Adapt Cloud credentials. Set the project explicitly:

```bash
export GCP_PROJECT="your-project-id"
export GCP_REGION="us-central1"
export GCP_ZONE="us-central1-a"
gcloud config set project "$GCP_PROJECT"
```

The residency enables the Compute, GKE, Artifact Registry, IAM, Logging and Monitoring APIs through Terraform. Your bootstrap identity therefore needs permission to enable project services and create the resources in this lab. In a controlled organization, have an administrator provide a purpose-built sandbox project rather than granting broad organization permissions.

## 2. Install and verify CLIs

Install current supported releases of:

- Google Cloud CLI (`gcloud`)
- Terraform
- `kubectl`
- Docker

Verify:

```bash
gcloud version
terraform version
kubectl version --client
docker version
```

## 3. Authenticate the CLI and Terraform

Interactive student workstation:

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project "$GCP_PROJECT"
gcloud auth list
gcloud auth application-default print-access-token >/dev/null
gcloud projects describe "$GCP_PROJECT"
```

`gcloud auth login` authenticates the CLI. Application Default Credentials (ADC) are what the Terraform Google provider uses in this local lab. Never commit credential JSON, access tokens, `.terraform/`, plans, or state containing sensitive values.

Run the residency preflight:

```bash
cd residency
make doctor PROVIDER=gcp ENV=dev
```

## 4. Least-privilege model

The bootstrap identity creates the lab. GKE nodes do **not** use that identity: Terraform creates a dedicated node service account and grants only the node, Artifact Registry read, logging-write and monitoring-write roles required by this path. Workload Identity Federation for GKE is enabled so application workloads can later receive dedicated Google IAM identities without node credential sharing.

For production, separate bootstrap/platform administration from workload deployment and use organization-approved custom roles where required. This residency does not require an organization-level role.

## 5. Terraform state

The first lab uses local Terraform state so a student can see the lifecycle directly. Treat the state as sensitive and do not commit it. Team/production use should move state to an approved remote backend with locking, versioning and access controls.

Initialize:

```bash
make init PROVIDER=gcp ENV=dev
```

## 6. Inspect the plan before spending money

```bash
make plan PROVIDER=gcp ENV=dev
```

The plan should include a custom VPC/subnet, Cloud Router/NAT for private nodes, Artifact Registry, a dedicated node service account, a zonal GKE Standard cluster and one managed node by default. The cluster uses the GKE Regular release channel rather than pinning a patch that will quickly age.

Do not continue until you understand the planned resources.

## 7. Deploy dev

```bash
ALLOW_BILLABLE=yes make deploy PROVIDER=gcp ENV=dev
```

The adapter applies the reviewed Terraform plan, obtains GKE credentials, configures Docker for Artifact Registry, builds the canonical `insurance-agent-demo/api` workload, tags it with the Git commit by default, pushes it, deploys the common Kubernetes manifests and waits for rollout.

Verify context before making manual Kubernetes changes:

```bash
kubectl config current-context
kubectl get nodes
kubectl -n applied-ai-residency get deploy,svc,pods
```

## 8. Artifact Registry

The adapter performs Docker authentication automatically. To inspect it manually:

```bash
gcloud artifacts repositories list --location "$GCP_REGION" --project "$GCP_PROJECT"
gcloud artifacts docker images list \
  "$GCP_REGION-docker.pkg.dev/$GCP_PROJECT/adapt-residency-dev" \
  --project "$GCP_PROJECT"
```

A Git-derived immutable tag is used by default. Set `IMAGE_TAG` only when intentionally deploying an already-defined artifact identity.

## 9. Validate

```bash
make validate PROVIDER=gcp ENV=dev
```

Offline/CI validation checks Terraform and renders the shared Kubernetes manifests. When the GKE cluster exists, the command additionally checks nodes, workload objects and rollout state.

Application health is represented at both layers: the container exposes `/health`, while Kubernetes uses liveness/readiness probes in the shared workload contract.

## 10. Metrics, logs, traces, health

Start with the portable view:

```bash
make observe PROVIDER=gcp ENV=dev
kubectl -n applied-ai-residency get pods
kubectl -n applied-ai-residency logs deployment/applied-ai-workload
kubectl -n applied-ai-residency get events --sort-by=.lastTimestamp
```

Then inspect Google-native signals. GKE workload/system logging is enabled, as is Cloud Monitoring with Managed Service for Prometheus:

```bash
gcloud logging read \
  'resource.type=k8s_container AND resource.labels.cluster_name=adapt-residency-dev' \
  --project "$GCP_PROJECT" --limit=20
```

In Google Cloud Monitoring, inspect Kubernetes workload CPU/memory, pod restarts, availability and Managed Prometheus metrics. The later cross-provider observability layer adds the shared OpenTelemetry Collector/export configuration and trace exercises once AWS, GCP, Azure and OpenStack provider parity exists; application code should not be coupled to a Google-only telemetry SDK.

## 11. Resource and cost visibility

Before and after deployment, inspect the project in Google Cloud Billing and resource views. The principal billable lab resources include GKE worker compute, persistent/network resources, Cloud NAT traffic/processing, Artifact Registry storage and telemetry ingestion/retention beyond included allowances.

Use labels and names to correlate resources with `applied-ai-residency` and the environment. Do not assume `terraform destroy` can remove resources you created manually outside its state.

## 12. Promote dev → QA → staging → production

Each environment is an explicit state/configuration boundary:

```bash
make promote PROVIDER=gcp FROM=dev TO=qa
```

Promotion means preserving the tested container artifact identity, not rebuilding source differently for QA or production. Provision the target environment, then deploy it with the source `IMAGE_TAG`. Automated digest capture/promotion is finalized in the shared promotion layer so all four providers use one rule.

Repeat the lifecycle deliberately for `qa`, `staging`, then `prod`. Production should use organization-specific controls beyond this portable student baseline: approved remote state, stronger access boundaries, policy controls, backup/recovery, SLOs and production capacity design.

## 13. Troubleshooting

**Terraform says ADC is unavailable:**

```bash
gcloud auth application-default login
```

**Wrong project:**

```bash
gcloud config get-value project
echo "$GCP_PROJECT"
gcloud projects describe "$GCP_PROJECT"
```

**Wrong Kubernetes context:**

```bash
gcloud container clusters get-credentials adapt-residency-dev \
  --zone "$GCP_ZONE" --project "$GCP_PROJECT"
kubectl config current-context
```

**Docker cannot push:**

```bash
gcloud auth configure-docker "$GCP_REGION-docker.pkg.dev"
```

**Private nodes cannot reach registries/APIs:** inspect the Cloud Router/NAT, subnet Private Google Access and firewall/network state before changing workload manifests.

## 14. Destroy and verify

Destroy as soon as the exercise is complete:

```bash
make destroy PROVIDER=gcp ENV=dev
```

Confirm the cluster is gone:

```bash
! gcloud container clusters describe adapt-residency-dev \
  --zone "$GCP_ZONE" --project "$GCP_PROJECT"
```

Then inspect the project for residual Artifact Registry repositories, compute/network resources, disks, external IPs and any resources created manually outside Terraform. Finally review Google Cloud Billing; billing data can lag, so absence of an immediate charge is not proof that resources were deleted.

## Legacy `gke/` note

The repository contains an older standalone `gke/` experiment. It hard-codes a project and older provider/module assumptions and is **not** the residency deployment path. It remains untouched for historical compatibility in this PR. New residency work must use `residency/terraform/providers/gcp` and the common lifecycle contract.
