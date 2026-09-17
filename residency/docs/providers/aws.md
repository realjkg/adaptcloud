# AWS Provider Lab — EKS

This path teaches the common residency lifecycle on AWS using Terraform, Amazon EKS, ECR, AWS CLI, Docker and kubectl. The application artifact is the existing containerized insurance-agent API; the Kubernetes contract remains provider-neutral.

> Cost warning: EKS, EC2 worker nodes and the NAT gateway are billable. The CLI refuses `deploy` unless `ALLOW_BILLABLE=yes` is explicitly set. Destroy the lab when finished and verify tagged resources afterward.

## 1. Prerequisites

Use a student-owned AWS account or an authorized sandbox. Install:

```bash
aws --version
terraform version
kubectl version --client
docker version
```

The Terraform adapter currently targets AWS provider 6.x, EKS module 21.24.2, VPC module 6.6.1 and Kubernetes 1.34. Re-check supported EKS versions before a live deployment; 1.34 is in EKS standard support as of September 2026.

## 2. Authenticate and verify identity

Configure AWS CLI using your organization's approved SSO/federation or lab credential method. Do not commit credentials.

```bash
aws sts get-caller-identity
export AWS_REGION=us-east-2
make -C residency doctor PROVIDER=aws ENV=dev
```

`doctor` verifies AWS CLI, Terraform, kubectl and Docker and confirms that AWS STS can resolve the current identity.

## 3. Least privilege

The identity running this infrastructure lab needs permission to create the VPC/network resources, EKS/IAM resources, ECR repository and related tags represented by the Terraform plan. Prefer a dedicated sandbox role and short-lived credentials. In an enterprise account, have the cloud administrator supply an approved role rather than broadening your personal identity.

## 4. Initialize Terraform

```bash
make -C residency init PROVIDER=aws ENV=dev
```

The initial lab uses local Terraform state. Do not share local state or commit `.terraform/`, plan files, state, or credentials. A remote-state exercise can be introduced separately because backend bootstrap and locking policies vary by organization.

## 5. Inspect the plan

```bash
AWS_REGION=us-east-2 make -C residency plan PROVIDER=aws ENV=dev
```

Read the plan before deployment. Expect a two-AZ VPC, public/private subnets, one NAT gateway, EKS control plane, one managed node by default, EKS core add-ons and an immutable ECR repository. The single NAT gateway is intentionally a lab cost tradeoff; production topology should evaluate AZ resilience separately.

## 6. Deploy dev

Deployment is deliberately opt-in because it creates billable infrastructure:

```bash
ALLOW_BILLABLE=yes AWS_REGION=us-east-2 make -C residency deploy PROVIDER=aws ENV=dev
```

The adapter applies the reviewed plan, updates kubeconfig, authenticates Docker to ECR, builds `insurance-agent-demo/api`, pushes an immutable Git-derived image tag, applies the common Kubernetes overlay, replaces the placeholder image with the ECR image and waits for rollout.

Verify context and workload:

```bash
aws eks update-kubeconfig --name adapt-residency-dev --region us-east-2
kubectl config current-context
kubectl get nodes
kubectl -n applied-ai-residency get deploy,svc,pods
```

## 7. Validate

```bash
make -C residency validate PROVIDER=aws ENV=dev
```

Without a live cluster this performs Terraform and Kustomize validation. With the cluster present it also checks nodes, workload objects and rollout status.

## 8. Metrics, logs, traces and health

```bash
make -C residency observe PROVIDER=aws ENV=dev
kubectl -n applied-ai-residency get pods
kubectl -n applied-ai-residency logs deployment/applied-ai-workload
kubectl -n applied-ai-residency get events --sort-by=.lastTimestamp
```

The Kubernetes deployment uses `/health` for liveness and readiness. The cross-provider observability PR will add the OpenTelemetry Collector/export path so application metrics, logs and traces share the same instrumentation contract across AWS, Azure, GCP and OpenStack. AWS-native destination work will use the CloudWatch/EKS observability ecosystem rather than embedding AWS-specific monitoring calls in application code.

## 9. Resource and cost visibility

All Terraform-managed resources inherit `Project=applied-ai-residency`, `Environment=<env>` and `ManagedBy=terraform` where AWS supports default tags. Review the AWS Billing/Cost Management tools and tagged resources. EKS control-plane charges, EC2 nodes and NAT gateway usage are the important lab resources to watch.

## 10. QA, staging and production

Create and inspect each environment independently:

```bash
make -C residency init PROVIDER=aws ENV=qa
make -C residency plan PROVIDER=aws ENV=qa
# deploy only after reviewing cost/plan
```

Repeat for `staging` and `prod`. Production's Kubernetes overlay requests two application replicas; infrastructure sizing remains explicitly configurable rather than silently scaled. Artifact promotion should reuse the immutable source image tag. The CLI exposes the promotion contract, while automated cross-environment digest promotion is completed with the common artifact workflow.

## 11. Troubleshooting

Start with identity/context rather than changing infrastructure:

```bash
aws sts get-caller-identity
aws configure get region
kubectl config current-context
aws eks describe-cluster --name adapt-residency-dev --region us-east-2
terraform -chdir=residency/terraform/providers/aws validate
```

If Docker cannot push, re-run ECR authentication. If nodes are not ready, inspect the EKS node group and Kubernetes events. If Terraform reports a version/module error, do not remove security or lifecycle features to make validation pass; verify current supported provider/module versions first.

## 12. Destroy and verify

```bash
make -C residency destroy PROVIDER=aws ENV=dev
```

The adapter first removes the Kubernetes workload, then runs Terraform destroy and verifies that the named EKS cluster no longer resolves. Finally inspect AWS resources by the residency tags and check billing/cost tooling for anything created outside Terraform state. A successful Terraform destroy is not proof that manually created resources are gone.

## Current boundary

AWS infrastructure, container build/push, Kubernetes deployment, validation, basic health/log navigation and destroy are implemented here. Full portable OpenTelemetry export/dashboards and automated immutable digest promotion are intentionally completed in their dedicated cross-provider layers rather than duplicated in the AWS adapter.
