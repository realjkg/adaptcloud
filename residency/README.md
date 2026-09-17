# Applied AI Engineering Residency — Platform Contract

The residency teaches one portable production lifecycle rather than four provider-specific applications.

```text
Applied AI workload
        ↓
Container contract
        ↓
Kubernetes workload contract
        ↓
Optional Korifi / cf push experience
        ↓
Terraform provider contract
        ↓
AWS | Azure | GCP | OpenStack
        ↓
Dev → QA → Staging → Production
        ↓
Metrics + Logs + Traces + Health + Cost
        ↓
Validate → Destroy
```

## Contract

Every provider adapter MUST expose the same student lifecycle:

```bash
make doctor PROVIDER=<aws|azure|gcp|openstack>
make init PROVIDER=<provider> ENV=<dev|qa|staging|prod>
make plan PROVIDER=<provider> ENV=<environment>
make deploy PROVIDER=<provider> ENV=<environment>
make validate PROVIDER=<provider> ENV=<environment>
make observe PROVIDER=<provider> ENV=<environment>
make promote PROVIDER=<provider> FROM=<environment> TO=<environment>
make destroy PROVIDER=<provider> ENV=<environment>
```

Students bring their own cloud/private-cloud credentials. Residency code must not depend on Adapt Cloud credentials or infrastructure.

## Portability boundaries

1. **Application** — provider-neutral AI workload with health endpoints and OpenTelemetry instrumentation.
2. **Container** — OCI image contract; immutable image promoted between environments.
3. **Kubernetes** — common workload/service/configuration contract. Provider adapters supply infrastructure, identity, ingress and storage integration.
4. **PaaS (optional)** — Korifi exposes the Cloud Foundry developer workflow over Kubernetes. It is not required for the core path.
5. **Terraform** — provider adapters implement a shared input/output and lifecycle contract.
6. **Environment promotion** — dev → qa → staging → prod promotes a tested artifact/configuration; it does not rebuild application code for each environment.
7. **Observability** — every target must expose metrics, logs, traces, health/readiness and cost/resource visibility.
8. **Teardown** — every lab must have a documented, verifiable destroy path.

## Repository layout

```text
residency/
  app/                  # canonical AI workload
  container/            # OCI build contract
  kubernetes/
    base/                # provider-neutral manifests
    environments/       # dev/qa/staging/prod overlays or values
  paas/
    korifi/              # optional CF/Korifi experience
  terraform/
    modules/             # reusable provider-neutral composition where practical
    providers/
      aws/
      azure/
      gcp/
      openstack/
    environments/
  observability/
    otel/                # OpenTelemetry application/collector contract
    dashboards/          # portable dashboard/SLO definitions where practical
  cli/                   # lifecycle orchestration used by Make targets
  docs/
    getting-started.md
    architecture.md
    environments.md
    observability.md
    troubleshooting.md
    providers/
      aws.md
      azure.md
      gcp.md
      openstack.md
    paas/
      korifi.md
  validation/            # static and local contract checks
```

Directories are introduced incrementally. A provider is not marked complete until its implementation, CLI path, setup guide, observability guide, validation path and destroy procedure satisfy the definition below.

## Definition of done — provider

A provider is complete only when a student can, using their own account or private cloud:

- install and verify required CLIs;
- authenticate without repository-stored credentials;
- initialize Terraform and inspect a plan;
- provision the Kubernetes target and required registry/identity/networking;
- build/push or reference the canonical OCI image;
- deploy the common Kubernetes workload;
- verify health/readiness and a functional application request;
- locate application metrics, logs and traces;
- inspect basic resource/cost signals appropriate to the provider;
- promote the same tested artifact through dev, qa, staging and prod;
- run validation independently of deployment;
- destroy lab resources and verify teardown.

## Safety and cost controls

Labs default to the smallest practical non-production footprint. `plan` precedes `deploy`; destructive commands require an explicit provider and environment. Documentation must identify resources that can continue accruing charges and show teardown verification. CI validates configuration and contracts without provisioning billable infrastructure by default.

## Delivery sequence

The implementation remains serialized and merge-gated:

1. Platform contract and skeleton.
2. AWS adapter reconciliation.
3. GCP adapter reconciliation.
4. Azure adapter parity.
5. OpenStack private-cloud adapter.
6. Cross-provider OpenTelemetry observability contract.
7. Optional Korifi / Cloud Foundry workflow.
8. End-to-end residency validation and documentation audit.

Each subsequent provider PR starts from newly merged `main`; existing working provider material is refactored/reused rather than duplicated.