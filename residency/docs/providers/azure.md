# Azure / AKS Residency Path

This lab deploys the standard Applied AI app to your own Azure subscription. It uses Terraform, Azure Kubernetes Service (AKS), Azure Container Registry (ACR), Azure CNI Overlay with Cilium for networking, Microsoft Entra Workload ID, and Azure Monitor with Log Analytics.

The top-level `azure/` folder holds Adapt Cloud's larger landing-zone and insurance app work. It's useful to read, but the residency lab is kept separate under `residency/` on purpose, so students don't pick up Adapt Cloud's subscriptions, credentials, naming, policy assumptions or app-specific infrastructure.

## 1. What this path teaches

You'll run the same commands as on AWS and GCP:

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

What's specific to Azure: which subscription and tenant you're in, resource groups, AKS, ACR, managed identities, Microsoft Entra Workload ID, Azure CNI with Cilium, Log Analytics, Azure Monitor, resource tags and Azure Cost Management.

## 2. Prerequisites

Use your own Azure subscription. You need permission to create a resource group, a VNet and subnet, an ACR, a Log Analytics workspace, an AKS cluster and a role assignment. You also need permission to register the resource providers the lab uses. If your organization registers providers centrally, ask the subscription administrator to do it instead of giving your account more access.

Required local tools:

```bash
az version
terraform version
kubectl version --client
docker version
git --version
```

When you run the lab on your machine, Terraform signs in as whoever the Azure CLI is signed in as. The residency currently pins the AzureRM provider to version 5.4.x.

## 3. Sign in and select the subscription

```bash
az login
az account list -o table
export AZURE_SUBSCRIPTION_ID='<your-subscription-guid>'
az account set --subscription "$AZURE_SUBSCRIPTION_ID"
az account show -o table
```

Always check `az account show` before you create anything. A common mistake is deploying into the wrong subscription after switching tenants or accounts.

To use a different region (optional):

```bash
export AZURE_LOCATION=eastus2
```

## 4. Check your setup and register resource providers

From `residency/`:

```bash
make doctor PROVIDER=azure ENV=dev
make init PROVIDER=azure ENV=dev
```

`doctor` checks the local tools, who you're signed in as, and that you picked a subscription. `init` registers the Azure resource providers this lab needs, then sets up Terraform. Registering providers doesn't create the AKS or ACR resources, but it does change the subscription's settings, so it needs the right permissions.

To check registration yourself:

```bash
for rp in Microsoft.ContainerService Microsoft.ContainerRegistry Microsoft.Network Microsoft.OperationalInsights Microsoft.Insights; do
  az provider show --namespace "$rp" --query '{namespace:namespace,state:registrationState}' -o table
done
```

## 5. Review the Terraform plan

```bash
make plan PROVIDER=azure ENV=dev
```

The plan creates one resource group just for the lab, containing:

- a VNet and AKS node subnet;
- an ACR registry with its administrator account turned off;
- a Log Analytics workspace;
- an AKS Standard cluster on the Free control-plane tier;
- Azure CNI Overlay, with Cilium handling traffic and network policy;
- an OIDC issuer and Microsoft Entra Workload ID support;
- a system-assigned identity for AKS and one for the kubelet;
- an `AcrPull` role assignment for the kubelet identity;
- tags for the project, the environment and "managed by Terraform".

Review the plan before you go on. You can be charged for AKS worker nodes, networking, ACR, logs and related Azure services.

## 6. Deploy dev

Deploy is blocked until you confirm that you know real infrastructure costs money:

```bash
ALLOW_BILLABLE=yes make deploy PROVIDER=azure ENV=dev
```

Deploy applies the saved plan, gets AKS credentials with `az aks get-credentials` and signs Docker in to ACR as you. It then builds the standard residency app, pushes it with a tag taken from Git that can't be overwritten, applies the shared Kubernetes overlay and waits for the rollout to finish.

Check your context before running other Kubernetes commands:

```bash
kubectl config current-context
kubectl get nodes
kubectl -n applied-ai-residency get deploy,svc,pods
```

## 7. ACR and workload identity

The registry's administrator account stays off. AKS pulls images using its kubelet managed identity and the `AcrPull` role, which is limited to this registry.

To see how they're connected:

```bash
RG=adapt-residency-dev-rg
CLUSTER=adapt-residency-dev
az aks show -g "$RG" -n "$CLUSTER" --query identityProfile.kubeletidentity -o jsonc
az role assignment list --scope "$(az acr show -g "$RG" --query id -o tsv)" -o table
```

The cluster also turns on the OIDC issuer and Microsoft Entra Workload ID. Later labs can link a Kubernetes service account to an Azure managed identity with limited permissions, instead of putting Azure credentials in pods.

## 8. Validate

```bash
make validate PROVIDER=azure ENV=dev
```

Without a running cluster, this checks the Terraform files and that the Kubernetes files render. With the cluster running, it also refreshes kubeconfig, checks the nodes and workload objects and confirms the rollout finished.

Other useful checks:

```bash
az aks show -g adapt-residency-dev-rg -n adapt-residency-dev -o table
kubectl -n applied-ai-residency get pods
kubectl -n applied-ai-residency describe deployment applied-ai-workload
```

## 9. Metrics, logs, traces and health

Start with the Kubernetes view, which works the same on every cloud:

```bash
make observe PROVIDER=azure ENV=dev
kubectl -n applied-ai-residency get pods
kubectl -n applied-ai-residency logs deployment/applied-ai-workload
kubectl -n applied-ai-residency get events --sort-by=.lastTimestamp
```

AKS sends data to its own Log Analytics workspace through the Azure Monitor agent. Find it with:

```bash
az monitor log-analytics workspace list -g adapt-residency-dev-rg -o table
```

If you have the Log Analytics query extension installed, get the workspace's customer ID and look at recent container logs:

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

Once all four clouds are at the same level, a separate observability PR will move app metrics, logs and traces onto the shared OpenTelemetry setup. The Azure adapter deliberately doesn't tie the app code to an Azure-only telemetry library.

Health checks work the same everywhere, through Kubernetes liveness, readiness and rollout status.

## 10. Resource and cost visibility

List everything in the lab's resource group:

```bash
az resource list -g adapt-residency-dev-rg -o table
```

In Azure Cost Management, filter by resource group `adapt-residency-dev-rg` or by the tags:

```text
Project=applied-ai-residency
Environment=dev
```

AKS has its own cost analysis on some cluster tiers and setups, but the residency doesn't make you pay for a more expensive control-plane tier just to see it. The cost lesson that applies on every cloud: know every resource you pay for, tag them all the same way, check the cloud's cost data, and delete the lab when you're done.

## 11. Promote dev → QA → staging → prod

Moving to the next environment keeps the exact image you tested, instead of rebuilding the code for each environment.

```bash
make promote PROVIDER=azure FROM=dev TO=qa
```

Create the target environment with its own Terraform state and plan, then deploy it with the original image tag through `IMAGE_TAG`. Until the shared promotion layer records the image digest automatically, check the tag and digest in ACR before you promote:

```bash
az acr repository show-tags \
  --name "$(terraform -chdir=terraform/providers/azure output -raw acr_name)" \
  --repository applied-ai-workload \
  -o table
```

Do the same, step by step, for QA → staging → prod. In student labs, delete every environment except dev whenever you're not using it.

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

**ACR pull failure:** check the kubelet identity and the `AcrPull` assignment. Don't turn on the ACR administrator password as a shortcut.

**Address overlap:** change the VNet, node, pod or service CIDRs in Terraform before you create anything. With Azure CNI Overlay, these address ranges must not overlap.

**Quota or VM-size failure:** check which VM sizes the region offers and your subscription's quota, then pick a small, generally available Linux VM size that suits the lab. Don't just raise capacity.

## 13. Destroy and verify

Tear down as soon as you finish the exercise:

```bash
make destroy PROVIDER=azure ENV=dev
```

Terraform asks you to confirm, then deletes the lab's resource group and everything in it. The CLI then checks that the resource group no longer exists.

Check it yourself as well:

```bash
az group show -n adapt-residency-dev-rg
```

After a successful teardown you should see `ResourceGroupNotFound`. Finally, look through the subscription's resource list and Azure Cost Management for anything you created by hand or outside this Terraform state.

## 14. How this relates to the `azure/` folder

The repository already has a much larger Azure setup with landing zones, policy as code and an insurance app. Some of it can help with advanced residency labs, especially identity, AI Foundry, networking and observability. It is **not** pulled into this basic adapter, because the residency requires a small deployment that works on any cloud, in the student's own account, with no dependency on Adapt Cloud infrastructure.
