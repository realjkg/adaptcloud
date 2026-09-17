# Residency Architecture

## Principle

The workload is portable; providers are replaceable deployment targets. Kubernetes is the workload portability boundary and Terraform is the infrastructure lifecycle boundary.

## Layers

### Applied AI workload

The canonical workload must expose a functional request path plus liveness and readiness endpoints. Application telemetry uses OpenTelemetry-compatible signals rather than directly coupling application code to one cloud monitoring SDK.

### OCI container

One image is built and identified by immutable tag/digest. Environment promotion references the tested artifact instead of rebuilding different binaries for dev, QA, staging and production.

### Kubernetes workload

Provider-neutral manifests define the workload. Provider-specific concerns such as cluster creation, workload identity, registry, ingress/load balancing, DNS and storage are handled below or through documented overlays.

### Optional Korifi / Cloud Foundry

Korifi is an optional PaaS exercise after the Kubernetes path works. It demonstrates the `cf` developer experience without making Cloud Foundry a prerequisite for provider portability.

### Terraform providers

Provider adapters must converge on common lifecycle semantics and document provider-specific differences honestly. Do not hide meaningful differences in identity, networking, managed Kubernetes, observability or cost models merely to make interfaces look identical.

## Environments

The supported progression is:

```text
dev → qa → staging → prod
```

Each environment has explicit configuration and state boundaries. Promotion should preserve artifact identity. Production-like controls increase progressively; labs must remain practical for student-owned accounts.

## Observability contract

Every provider implementation must teach a student how to answer:

1. Is the workload alive and ready?
2. Is a request succeeding, and how long does it take?
3. What do application and platform logs say?
4. Can a request be followed through distributed traces?
5. What CPU, memory and Kubernetes resource pressure exists?
6. Which deployed resources can accrue cost and where is provider-native cost/resource visibility found?

The portable baseline is OpenTelemetry for application metrics, logs and traces plus Kubernetes health probes. Provider-native backends are destinations/integrations, not application dependencies.

## Validation contract

`validate` must be safe to run repeatedly. CI should prefer local/static checks: formatting, Terraform validation, Kubernetes schema/render validation, shell/CLI tests and documentation/link checks. Live cloud provisioning is opt-in and must never be required merely to validate a pull request.

## Destroy contract

`destroy` must require explicit provider and environment selection. Provider documentation must include a post-destroy verification step because a successful Terraform command does not by itself prove that every manually created or externally managed billable resource is gone.
