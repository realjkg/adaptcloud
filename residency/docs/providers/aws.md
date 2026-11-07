# AWS Provider Lab — EKS

This lab walks through the shared residency steps on AWS, using Terraform, Amazon EKS, ECR, the AWS CLI, Docker and kubectl. The app you deploy is the existing insurance-agent API container. The Kubernetes files are the same ones every other cloud uses.

> Cost warning: you pay for EKS, the EC2 worker nodes and the NAT gateway while they exist. The CLI won't run `deploy` unless you set `ALLOW_BILLABLE=yes`. Delete the lab when you're done, then check the tagged resources to confirm they're gone.

## 1. Prerequisites

Use your own AWS account or a sandbox you're allowed to use. Install:

```bash
aws --version
terraform version
kubectl version --client
docker version
```

The Terraform adapter currently uses AWS provider 6.x, EKS module 21.24.2, VPC module 6.6.1 and Kubernetes 1.34. Check which EKS versions are supported before you deploy for real; 1.34 is in EKS standard support as of September 2026.

## 2. Sign in and check your identity

Set up the AWS CLI with your organization's approved sign-in method (SSO, federation or lab credentials). Never commit credentials.

```bash
aws sts get-caller-identity
export AWS_REGION=us-east-2
make -C residency doctor PROVIDER=aws ENV=dev
```

`doctor` checks the AWS CLI, Terraform, kubectl and Docker, and confirms that AWS STS can tell who you're signed in as.

## 3. Only the permissions you need

The identity that runs this lab needs permission to create what the Terraform plan lists: the VPC and network resources, the EKS and IAM resources, the ECR repository and their tags. Use a separate sandbox role and short-lived credentials if you can. In a company account, ask the cloud administrator for an approved role instead of adding permissions to your own identity.

## 4. Set up Terraform

```bash
make -C residency init PROVIDER=aws ENV=dev
```

This first lab keeps Terraform state on your machine. Don't share that state, and don't commit `.terraform/`, plan files, state or credentials. Storing state remotely can be a separate exercise, because how organizations set that up and lock it varies.

## 5. Review the plan

```bash
AWS_REGION=us-east-2 make -C residency plan PROVIDER=aws ENV=dev
```

Read the plan before you deploy. You should see a VPC across two availability zones, public and private subnets, one NAT gateway, the EKS control plane, one managed node by default, the core EKS add-ons and an ECR repository whose image tags can't be overwritten. Using a single NAT gateway is a deliberate choice to keep lab costs down; for production, decide separately how much availability-zone resilience you need.

## 6. Deploy dev

You have to opt in to deploy, because it creates infrastructure you pay for:

```bash
ALLOW_BILLABLE=yes AWS_REGION=us-east-2 make -C residency deploy PROVIDER=aws ENV=dev
```

The adapter applies the plan you reviewed, updates kubeconfig, signs Docker in to ECR, builds `insurance-agent-demo/api` and pushes it with a tag taken from Git that can't be overwritten. Then it applies the shared Kubernetes overlay, swaps the placeholder image for the ECR image and waits for the rollout to finish.

Check your context and the workload:

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

Without a running cluster, this checks the Terraform and Kustomize files. With the cluster running, it also checks the nodes, the workload objects and the rollout status.

## 8. Metrics, logs, traces and health

```bash
make -C residency observe PROVIDER=aws ENV=dev
kubectl -n applied-ai-residency get pods
kubectl -n applied-ai-residency logs deployment/applied-ai-workload
kubectl -n applied-ai-residency get events --sort-by=.lastTimestamp
```

The Kubernetes deployment uses `/health` for liveness and readiness. A later PR, shared by all clouds, will add the OpenTelemetry Collector and export path, so app metrics, logs and traces are collected the same way on AWS, Azure, GCP and OpenStack. Sending that data to AWS will use CloudWatch and the EKS observability tools, instead of putting AWS-specific monitoring calls in the app code.

## 9. Resource and cost visibility

Every resource Terraform creates gets the tags `Project=applied-ai-residency`, `Environment=<env>` and `ManagedBy=terraform`, wherever AWS supports default tags. Check the AWS Billing and Cost Management tools and the tagged resources. The costs to watch in this lab are the EKS control plane, the EC2 nodes and the NAT gateway.

## 10. QA, staging and production

Create and review each environment separately:

```bash
make -C residency init PROVIDER=aws ENV=qa
make -C residency plan PROVIDER=aws ENV=qa
# deploy only after reviewing cost/plan
```

Repeat for `staging` and `prod`. The production Kubernetes overlay asks for two copies of the app. Infrastructure size is something you set yourself; it is never scaled up behind your back. Moving to the next environment should reuse the original image tag, which can't change. The CLI already has the `promote` command, and automatic promotion by image digest across environments arrives with the shared image workflow.

## 11. Troubleshooting

Check your identity and context first, before changing any infrastructure:

```bash
aws sts get-caller-identity
aws configure get region
kubectl config current-context
aws eks describe-cluster --name adapt-residency-dev --region us-east-2
terraform -chdir=residency/terraform/providers/aws validate
```

If Docker can't push, sign in to ECR again. If nodes aren't ready, look at the EKS node group and the Kubernetes events. If Terraform reports a version or module error, don't remove security or lifecycle settings to make validation pass; check which provider and module versions are currently supported first.

## 12. Destroy and verify

```bash
make -C residency destroy PROVIDER=aws ENV=dev
```

The adapter removes the Kubernetes workload first, then runs Terraform destroy and checks that the EKS cluster no longer exists. Afterward, look up AWS resources by the residency tags, and check the billing and cost tools for anything created outside Terraform. A Terraform destroy that succeeds doesn't prove that resources created by hand are gone.

## What's done so far

This adapter covers the AWS infrastructure, building and pushing the container, the Kubernetes deployment, validation, finding basic health and logs, and teardown. OpenTelemetry export, dashboards and automatic promotion by image digest are built once in the shared layers for all clouds, not repeated in the AWS adapter.
