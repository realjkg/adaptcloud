# Provider Adapter Contract

Provider implementations: `aws`, `azure`, `gcp`, `openstack`.

## Required lifecycle

| Command | Contract |
|---|---|
| `doctor` | Check required local CLIs, authentication prerequisites and configuration without changing infrastructure. |
| `init` | Initialize provider/environment state and Terraform dependencies. |
| `plan` | Produce an inspectable infrastructure plan without applying it. |
| `deploy` | Provision/update infrastructure and deploy the canonical workload. |
| `validate` | Test infrastructure/workload contracts and health without changing desired state. |
| `observe` | Print or document entry points for health, metrics, logs, traces and cost/resource inspection. |
| `promote` | Promote an immutable tested artifact/configuration from one environment to the next. |
| `destroy` | Remove lab-managed resources and perform/print post-destroy verification steps. |

## Required provider documentation

Each `docs/providers/<provider>.md` must contain, in order:

1. What the provider path teaches.
2. Account/project/tenant prerequisites.
3. Required CLI tools and version checks.
4. CLI authentication and how to verify current identity/context.
5. Least-privilege lab identity guidance.
6. Terraform backend/state assumptions.
7. Kubernetes target and kubeconfig/context verification.
8. Container registry authentication.
9. Step-by-step dev deployment.
10. Application and Kubernetes validation.
11. Metrics, logs, traces and health workflow.
12. Resource/cost visibility workflow.
13. Dev → QA → staging → production promotion.
14. Troubleshooting and common context/authentication mistakes.
15. Destroy and post-destroy verification.

Provider guides may use native commands where they are genuinely useful, but the common `make` lifecycle remains the primary residency interface.

## Provider-native mapping

The adapters should map equivalent responsibilities, not pretend products are identical:

| Responsibility | AWS | Azure | GCP | OpenStack |
|---|---|---|---|---|
| CLI | `aws` | `az` | `gcloud` | `openstack` |
| Kubernetes | EKS | AKS | GKE | Kubernetes on OpenStack |
| Registry | ECR | ACR | Artifact Registry | documented OCI registry choice |
| Workload identity | provider-supported AWS identity pattern | Managed Identity / workload identity | Workload Identity | Kubernetes/OpenStack identity integration as supported |
| Native observation | CloudWatch ecosystem | Azure Monitor ecosystem | Cloud Monitoring/Logging ecosystem | Kubernetes/OpenTelemetry + deployed/private-cloud tooling |
| Cost/resource view | AWS cost/resource tooling | Azure cost/resource tooling | Google Cloud billing/resource tooling | allocation/resource utilization; billing depends on operator platform |

Exact implementation choices belong in provider PRs and must be validated against current provider documentation when introduced.
