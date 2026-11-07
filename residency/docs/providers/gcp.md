# GCP / GKE Residency Path

This lab walks through the same residency steps as AWS, using Google Cloud's building blocks: `gcloud`, Artifact Registry, VPC-native GKE, Workload Identity Federation for GKE, Cloud Logging and Monitoring, and Google Cloud Billing. The app and Kubernetes manifests are the same ones every other cloud uses.

> This lab creates resources you pay for. `deploy` won't run unless you set `ALLOW_BILLABLE=yes`. Always finish with **Destroy and verify**.

## 1. Account and project prerequisites

Use your own Google Cloud account and a project with billing turned on. Don't use Adapt Cloud credentials. Set the project yourself:

```bash
export GCP_PROJECT="your-project-id"
export GCP_REGION="us-central1"
export GCP_ZONE="us-central1-a"
gcloud config set project "$GCP_PROJECT"
```

Terraform turns on the Compute, GKE, Artifact Registry, IAM, Logging and Monitoring APIs for the lab. So the identity you start with needs permission to turn on project services and create the lab's resources. If your organization restricts this, ask an administrator for a sandbox project made for the lab instead of broad organization permissions.

## 2. Install and check the command-line tools

Install current, supported versions of:

- Google Cloud CLI (`gcloud`)
- Terraform
- `kubectl`
- Docker

Check them:

```bash
gcloud version
terraform version
kubectl version --client
docker version
```

## 3. Sign in the CLI and Terraform

On your own machine:

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project "$GCP_PROJECT"
gcloud auth list
gcloud auth application-default print-access-token >/dev/null
gcloud projects describe "$GCP_PROJECT"
```

`gcloud auth login` signs in the CLI. Terraform's Google provider signs in with Application Default Credentials (ADC) in this lab. Never commit credential JSON files, access tokens, `.terraform/`, plans, or state that holds sensitive values.

Run the residency's setup check:

```bash
cd residency
make doctor PROVIDER=gcp ENV=dev
```

## 4. Only the permissions each identity needs

The identity you start with creates the lab. GKE nodes do **not** use that identity. Terraform creates a separate service account for the nodes and gives it only what this lab needs: the node role, read access to Artifact Registry, and permission to write logs and metrics. Workload Identity Federation for GKE is on, so apps can later get their own Google IAM identities instead of sharing the nodes' credentials.

For production, keep setting up the platform separate from deploying apps, and use custom roles your organization approves where needed. This residency doesn't need any organization-level role.

## 5. Terraform state

The first lab keeps Terraform state on your machine so you can see each step directly. Treat the state as sensitive and don't commit it. For a team or production, move state to an approved remote backend with locking, versioning and access controls.

Set it up:

```bash
make init PROVIDER=gcp ENV=dev
```

## 6. Review the plan before spending money

```bash
make plan PROVIDER=gcp ENV=dev
```

The plan should include a custom VPC and subnet, a Cloud Router and NAT for the private nodes, Artifact Registry, the nodes' own service account, a GKE Standard cluster in one zone and one managed node by default. The cluster follows the GKE Regular release channel instead of pinning a patch version that would soon be out of date.

Don't go on until you understand what the plan will create.

## 7. Deploy dev

```bash
ALLOW_BILLABLE=yes make deploy PROVIDER=gcp ENV=dev
```

The adapter applies the Terraform plan you reviewed, gets GKE credentials and sets up Docker for Artifact Registry. It then builds the standard `insurance-agent-demo/api` app, tags it with the Git commit by default, pushes it, deploys the shared Kubernetes manifests and waits for the rollout to finish.

Check your context before changing anything in Kubernetes by hand:

```bash
kubectl config current-context
kubectl get nodes
kubectl -n applied-ai-residency get deploy,svc,pods
```

## 8. Artifact Registry

The adapter signs Docker in for you. To look for yourself:

```bash
gcloud artifacts repositories list --location "$GCP_REGION" --project "$GCP_PROJECT"
gcloud artifacts docker images list \
  "$GCP_REGION-docker.pkg.dev/$GCP_PROJECT/adapt-residency-dev" \
  --project "$GCP_PROJECT"
```

By default the image gets a tag taken from Git that can't be overwritten. Set `IMAGE_TAG` only when you mean to deploy an image that already exists.

## 9. Validate

```bash
make validate PROVIDER=gcp ENV=dev
```

Without a cluster (offline or in CI), this checks Terraform and renders the shared Kubernetes manifests. When the GKE cluster exists, it also checks the nodes, the workload objects and the rollout.

Health is checked at two levels: the container answers on `/health`, and Kubernetes runs the liveness and readiness probes defined in the shared workload files.

## 10. Metrics, logs, traces, health

Start with the view that works the same on every cloud:

```bash
make observe PROVIDER=gcp ENV=dev
kubectl -n applied-ai-residency get pods
kubectl -n applied-ai-residency logs deployment/applied-ai-workload
kubectl -n applied-ai-residency get events --sort-by=.lastTimestamp
```

Then look at what Google Cloud collects. GKE logging for workloads and the system is on, and so is Cloud Monitoring with Managed Service for Prometheus:

```bash
gcloud logging read \
  'resource.type=k8s_container AND resource.labels.cluster_name=adapt-residency-dev' \
  --project "$GCP_PROJECT" --limit=20
```

In Google Cloud Monitoring, look at the workload's CPU and memory, pod restarts, availability and the Managed Prometheus metrics. Once AWS, GCP, Azure and OpenStack are at the same level, a later shared observability layer adds the OpenTelemetry Collector and export settings, plus trace exercises. App code shouldn't be tied to a Google-only telemetry library.

## 11. Resource and cost visibility

Before and after you deploy, check the project in Google Cloud Billing and the resource views. The main costs in this lab are GKE worker compute, disks and network resources, Cloud NAT traffic and processing, Artifact Registry storage, and telemetry beyond the free allowance.

Use labels and names to find the resources that belong to `applied-ai-residency` and each environment. Don't assume `terraform destroy` can remove resources you created by hand outside its state.

## 12. Promote dev → QA → staging → production

Each environment has its own state and configuration:

```bash
make promote PROVIDER=gcp FROM=dev TO=qa
```

Promoting means keeping the exact container image you tested, not rebuilding the code for QA or production. Create the target environment, then deploy it with the original `IMAGE_TAG`. Recording and promoting the image digest automatically is finished in the shared promotion layer, so all four clouds follow one rule.

Go through the steps carefully for `qa`, then `staging`, then `prod`. Production needs your organization's own controls on top of this student setup: approved remote state, tighter access, policy controls, backup and recovery, service-level objectives (SLOs) and capacity planned for production.

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

**Private nodes can't reach registries or APIs:** check the Cloud Router and NAT, Private Google Access on the subnet, and the firewall and network settings before you change the workload manifests.

## 14. Destroy and verify

Tear down as soon as you finish the exercise:

```bash
make destroy PROVIDER=gcp ENV=dev
```

Confirm the cluster is gone:

```bash
! gcloud container clusters describe adapt-residency-dev \
  --zone "$GCP_ZONE" --project "$GCP_PROJECT"
```

Then look through the project for anything left over: Artifact Registry repositories, compute and network resources, disks, external IPs and anything you created by hand outside Terraform. Finally, check Google Cloud Billing. Billing data can be delayed, so seeing no charge right away doesn't prove the resources were deleted.

## Legacy `gke/` note

The repository has an older, separate `gke/` experiment. It has a project name built in and assumes older provider and module versions, and it is **not** how the residency deploys. It was left as it is. New residency work must use `residency/terraform/providers/gcp` and the shared lifecycle commands.
