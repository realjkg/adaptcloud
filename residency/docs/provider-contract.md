# Provider Adapter Contract

Provider implementations: `aws`, `azure`, `gcp`, `openstack`.

## Required lifecycle

| Command | Contract |
|---|---|
| `doctor` | Check the local command-line tools, sign-in requirements and configuration without changing any infrastructure. |
| `init` | Set up state for the provider and environment, and download Terraform dependencies. |
| `plan` | Show the infrastructure changes so you can review them, without making them. |
| `deploy` | Create or update the infrastructure and deploy the standard app. |
| `validate` | Test the infrastructure, the app and its health without changing anything. |
| `observe` | Show where to look for health, metrics, logs, traces, cost and resource use. |
| `promote` | Move an unchanged, tested image and its configuration from one environment to the next. |
| `destroy` | Delete the resources the lab created, then run or print the steps that confirm they're gone. |

## Required provider documentation

Each `docs/providers/<provider>.md` must contain, in order:

1. What the provider path teaches.
2. What account, project or tenant you need first.
3. Required command-line tools and how to check their versions.
4. How to sign in from the command line and check which identity and context you're using.
5. How to give the lab identity only the permissions it needs.
6. Where Terraform keeps its state.
7. The Kubernetes cluster, and how to check your kubeconfig and context.
8. How to sign in to the container registry.
9. Step-by-step dev deployment.
10. Application and Kubernetes validation.
11. Metrics, logs, traces and health workflow.
12. How to see resource use and cost.
13. Dev → QA → staging → production promotion.
14. Troubleshooting, including common context and sign-in mistakes.
15. Teardown, and how to confirm it worked.

Provider guides can use the cloud's own commands where they really help, but the shared `make` commands stay the main way students work.

## Provider-native mapping

Each adapter should match up the services that do the same job on each cloud, without pretending the products are identical:

| Responsibility | AWS | Azure | GCP | OpenStack |
|---|---|---|---|---|
| CLI | `aws` | `az` | `gcloud` | `openstack` |
| Kubernetes | EKS | AKS | GKE | Kubernetes on OpenStack |
| Registry | ECR | ACR | Artifact Registry | documented OCI registry choice |
| Workload identity | provider-supported AWS identity pattern | Managed Identity / workload identity | Workload Identity | Kubernetes/OpenStack identity integration as supported |
| Native observation | CloudWatch ecosystem | Azure Monitor ecosystem | Cloud Monitoring/Logging ecosystem | Kubernetes/OpenTelemetry + deployed/private-cloud tooling |
| Cost/resource view | AWS cost/resource tooling | Azure cost/resource tooling | Google Cloud billing/resource tooling | allocation/resource utilization; billing depends on operator platform |

The exact choices for each cloud belong in that provider's PR, and must be checked against the cloud's current documentation when they're added.
