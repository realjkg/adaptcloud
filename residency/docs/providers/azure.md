# Azure / AKS Residency Path

This path deploys the canonical Applied AI workload to a student-owned Azure subscription using Terraform, Azure Kubernetes Service (AKS), Azure Container Registry (ACR), Azure CNI Overlay powered by Cilium, Microsoft Entra Workload ID, and Azure Monitor/Log Analytics.

The top-level `azure/` tree contains broader Adapt Cloud landing-zone and insurance workload material. It is useful reference material, but the residency path is intentionally isolated under `residency/` so students do not inherit Adapt Cloud subscriptions, credentials, naming, policy assumptions, or application-specific infrastructure.

## 1. What this path teaches

You will use the same lifecycle as AWS and GCP:

```bash
make doctor PROVIDER=azure ENV=dev
make init PROVIDER=azure ENV=dev
make plan PROVIDER=azure ENV=dev
ALLOW_BILLABLE=yes make deploy PROVIDER=azure ENV=dev
make validate PROVIDER=azure ENV=dev
make observe PROVIDER=azure ENV=dev
make promote PROVIDER=azure FROM=dev TO=qa
make destroy PROVIDER=azure ENV=dev
```

The provider-specific concepts are Azure subscription/tenant context, resource groups, AKS, ACR, managed identities, Microsoft Entra Workload ID, Azure CNI/Cilium, Log Analytics, Azure Monitor, resource tagging and Azure Cost Management.

## 2. Prerequisites

Use your own Azure subscription. You need permission to create a resource group, VNet/subnet, ACR, Log Analytics workspace, AKS cluster and role assignment. You also need permission to register the resource providers used by the lab; if your organization centralizes provider registration, ask the subscription administrator to register them instead of elevating your account.

Required local tools:

```bash
az version
terraform version
kubectl version --client
docker version
git --version
```

Terraform uses the Azure CLI identity for the local student workflow. The residency currently pins the AzureRM provider to the 5.4 minor line.

## 3. Sign in and select the subscription

```bash
az login
az account list -o table
export AZURE_SUBSCRIPTION_ID='<your-subscription-guid>'
az account set --subscription "$AZURE_SUBSCRIPTION_ID"
az account show -o table
```

Always inspect `az account show` before provisioning. A common Azure lab mistake is deploying into the wrong subscription after changing tenants or accounts.

Optional region override:

```bash
export AZURE_LOCATION=eastus2
```

## 4. Doctor and resource-provider initialization

From `residency/`:

```bash
make doctor PROVIDER=azure ENV=dev
make init PROVIDER=azure ENV=dev
```

`doctor` verifies the local CLIs, active Azure identity and explicit subscription. `init` registers the Azure namespaces required by this lab and then initializes Terraform. Resource-provider registration itself does not create the AKS/ACR lab, but it changes subscription configuration and requires suitable permissions.

You can inspect registration state directly:

```bash
for rp in Microsoft.ContainerService Microsoft.ContainerRegistry Microsoft.Network Microsoft.OperationalInsights Microsoft.Insights; do
  az provider show --namespace "$rp" --query '{namespace:namespace,state:registrationState}' -o table
done
```

## 5. Inspect the Terraform plan

```bash
make plan PROVIDER=azure ENV=dev
```

The plan creates a dedicated resource group containing:

- a VNet and AKS node subnet;
- an ACR registry with the administrator account disabled;
- a Log Analytics workspace;
- an AKS Standard cluster using the Free control-plane tier for the lab;
- Azure CNI Overlay with the Cilium data plane/network policy;
- OIDC issuer and Microsoft Entra Workload ID support;
- a system-assigned AKS identity and kubelet identity;
- an explicit `AcrPull` assignment for the kubelet identity;
- tags for project, environment and Terraform ownership.

Review the plan before continuing. AKS worker nodes, networking, ACR, logs and related Azure services can incur charges.

## 6. Deploy dev

Deployment is deliberately blocked unless you acknowledge that live infrastructure is billable:

```bash
ALLOW_BILLABLE=yes make deploy PROVIDER=azure ENV=dev
```

The deploy path applies the saved plan, obtains AKS credentials with `az aks get-credentials`, signs Docker into ACR with your Azure identity, builds the canonical residency workload, pushes an immutable Git-derived image tag, applies the shared Kubernetes overlay and waits for rollout.

Verify context before running ad-hoc Kubernetes commands:

```bash
kubectl config current-context
kubectl get nodes
kubectl -n applied-ai-residency get deploy,svc,pods
```

## 7. ACR and workload identity

The registry administrator account remains disabled. AKS pulls images using its kubelet managed identity and the scoped `AcrPull` role assignment.

Inspect the relationship:

```bash
RG=adapt-residency-dev-rg
CLUSTER=adapt-residency-dev
az aks show -g "$RG" -n "$CLUSTER" --query identityProfile.kubeletidentity -o jsonc
az role assignment list --scope "$(az acr show -g "$RG" --query id -o tsv)" -o table
```

The AKS cluster also enables the OIDC issuer and Microsoft Entra Workload ID. Later labs can bind a Kubernetes service account to a narrowly scoped Azure managed identity instead of placing Azure credentials in pods.

## 8. Validate

```bash
make validate PROVIDER=azure ENV=dev
```

Without a live cluster this performs Terraform and Kubernetes render validation. With a live cluster it also refreshes kubeconfig, checks nodes/workload objects and verifies the deployment rollout.

Useful direct checks:

```bash
az aks show -g adapt-residency-dev-rg -n adapt-residency-dev -o table
kubectl -n applied-ai-residency get pods
kubectl -n applied-ai-residency describe deployment applied-ai-workload
```

## 9. Metrics, logs, traces and health

Start with the portable Kubernetes view:

```bash
make observe PROVIDER=azure ENV=dev
kubectl -n applied-ai-residency get pods
kubectl -n applied-ai-residency logs deployment/applied-ai-workload
kubectl -n applied-ai-residency get events --sort-by=.lastTimestamp
```

AKS is connected to a dedicated Log Analytics workspace through the Azure Monitor agent. Find it with:

```bash
az monitor log-analytics workspace list -g adapt-residency-dev-rg -o table
```

If you have the Log Analytics query extension installed, obtain the workspace customer ID and query recent container records:

```bash
WORKSPACE_ID=$(az monitor log-analytics workspace show \
  -g adapt-residency-dev-rg \
  -n adapt-residency-dev-logs \
  --query customerId -o tsv)

az monitor log-analytics query \
  --workspace "$WORKSPACE_ID" \
  --analytics-query 'ContainerLogV2 | take 20' \
  --timespan PT1H
```

Application metrics, logs and traces will converge on the shared OpenTelemetry contract in the dedicated observability PR after all four infrastructure providers reach parity. The Azure adapter intentionally does not couple application code to an Azure-only telemetry SDK.

Health remains portable through Kubernetes liveness/readiness and rollout status.

## 10. Resource and cost visibility

List the complete lab resource group:

```bash
az resource list -g adapt-residency-dev-rg -o table
```

In Azure Cost Management, filter by resource group `adapt-residency-dev-rg` or by the tags:

```text
Project=applied-ai-residency
Environment=dev
```

AKS also has cost-analysis capabilities for supported cluster tiers/configurations, but the residency does not require enabling a more expensive control-plane tier merely to expose that feature. The portable cost lesson is to identify all billable resources, tag them consistently, inspect provider-native cost data and destroy the lab when finished.

## 11. Promote dev → QA → staging → prod

Promotion preserves the tested image identity rather than rebuilding source differently per environment.

```bash
make promote PROVIDER=azure FROM=dev TO=qa
```

Provision the target environment with its own Terraform state/plan, then deploy using the source image tag through `IMAGE_TAG`. Until the shared promotion layer automates digest capture, verify the source tag/digest in ACR before promotion:

```bash
az acr repository show-tags \
  --name "$(terraform -chdir=terraform/providers/azure output -raw acr_name)" \
  --repository applied-ai-workload \
  -o table
```

Repeat the same controlled progression for QA → staging → prod. Student labs should keep non-dev environments destroyed when they are not actively being used.

## 12. Troubleshooting

**Wrong subscription:**

```bash
az account show -o table
printf '%s\n' "$AZURE_SUBSCRIPTION_ID"
```

**Resource provider not registered:**

```bash
az provider show --namespace Microsoft.ContainerService --query registrationState -o tsv
make init PROVIDER=azure ENV=dev
```

**AKS context is stale:**

```bash
az aks get-credentials -g adapt-residency-dev-rg -n adapt-residency-dev --overwrite-existing
kubectl config current-context
```

**ACR pull failure:** inspect the kubelet identity and `AcrPull` assignment; do not enable the ACR administrator password as a shortcut.

**Address overlap:** change the Terraform VNet, node, pod or service CIDRs before provisioning. Azure CNI Overlay requires non-overlapping network planning.

**Quota/VM-size failure:** query region SKUs and subscription quota, then choose a small generally available Linux VM size appropriate for the lab rather than blindly increasing capacity.

## 13. Destroy and verify

Destroy as soon as the exercise is complete:

```bash
make destroy PROVIDER=azure ENV=dev
```

Terraform asks for confirmation and removes the residency-managed resource group and resources. The CLI then verifies that the resource group no longer resolves.

Perform an independent check:

```bash
az group show -n adapt-residency-dev-rg
```

A `ResourceGroupNotFound` result is expected after successful teardown. Finally inspect the subscription resource list and Azure Cost Management for anything you created manually or outside this Terraform state.

## 14. Relationship to the existing `azure/` tree

The repository already contains a much broader Azure implementation with landing zones, policy-as-code and an insurance workload. Some of that material can inform advanced residency labs, especially identity, AI Foundry, networking and observability. It is **not** silently imported into this foundational provider adapter because the residency contract requires a minimal, portable, student-owned deployment with zero dependency on Adapt Cloud infrastructure.
