# Residency Architecture

## Principle

The app moves; the cloud underneath can be swapped. Kubernetes is what keeps the app the same on every cloud, and Terraform is what creates, changes and deletes the infrastructure.

## Layers

### Applied AI workload

The standard app must answer real requests and have liveness and readiness endpoints. It reports telemetry in a form OpenTelemetry understands, so the app code isn't tied to one cloud's monitoring library.

### OCI container

The image is built once and identified by a tag or digest that never changes. Moving to the next environment uses that same tested image instead of building new binaries for dev, QA, staging and production.

### Kubernetes workload

The same manifests describe the app on every cloud. Things that differ by cloud, such as creating the cluster, workload identity, the registry, ingress and load balancing, DNS and storage, are handled underneath or through documented overlays.

### Optional Korifi / Cloud Foundry

Korifi is an optional platform-as-a-service exercise for after the Kubernetes path works. It shows the `cf` developer experience, but you don't need Cloud Foundry to move between clouds.

### Terraform providers

Provider adapters must behave the same way across the lifecycle and describe each cloud's differences honestly. Don't hide real differences in identity, networking, managed Kubernetes, observability or cost just so the adapters look identical.

## Environments

The supported progression is:

```text
dev → qa → staging → prod
```

Each environment has its own configuration and its own state. Moving to the next environment should keep the exact same image. Controls get closer to production at each step, but labs must stay practical for students' own accounts.

## Observability contract

Every provider guide must teach a student how to answer:

1. Is the workload alive and ready?
2. Is a request succeeding, and how long does it take?
3. What do application and platform logs say?
4. Can a request be followed through distributed traces?
5. What CPU, memory and Kubernetes resource pressure exists?
6. Which deployed resources cost money, and where does the cloud show cost and resource use?

On every cloud, the starting point is OpenTelemetry for app metrics, logs and traces, plus Kubernetes health probes. Each cloud's own monitoring tools are places to send that data, not something the app depends on.

## Validation contract

`validate` must be safe to run again and again. CI should favor checks that run locally without a cloud: formatting, Terraform validation, Kubernetes schema and render checks, shell and CLI tests, and documentation and link checks. Creating real cloud resources is opt-in and must never be needed just to check a pull request.

## Destroy contract

`destroy` must make you name the provider and environment. Each provider guide must include a step that checks the teardown afterward. A Terraform command that succeeds doesn't prove that every resource you're billed for is gone, especially ones created by hand or managed outside Terraform.
