# Applied AI Engineering Residency — Platform Contract

The residency teaches one way to take an AI app to production that works the same on every cloud, instead of four separate cloud-specific apps.

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

Every provider adapter must offer students the same commands, in the same order:

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

Students use their own cloud or private-cloud accounts. Residency code must not depend on Adapt Cloud's accounts or infrastructure.

## What stays the same on every cloud

1. **Application**: one AI app that runs anywhere, with health endpoints and OpenTelemetry instrumentation.
2. **Container**: a standard (OCI) container image. The same image moves from one environment to the next and is never changed.
3. **Kubernetes**: the same workload, service and configuration files everywhere. Each provider adapter supplies the infrastructure, identity, ingress and storage underneath.
4. **Platform as a service (optional)**: Korifi gives developers the Cloud Foundry `cf push` workflow on top of Kubernetes. The main path doesn't need it.
5. **Terraform**: every provider adapter takes the same inputs, returns the same outputs and supports the same lifecycle.
6. **Moving between environments**: going from dev → qa → staging → prod moves an image and configuration that already passed testing. The app code is not rebuilt for each environment.
7. **Observability**: every target must show metrics, logs, traces, health and readiness, and what resources cost.
8. **Teardown**: every lab must have a written way to delete what it created, and a way to check that it's gone.

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

Folders are added as the work reaches them. A provider isn't marked complete until its code, command-line path, setup guide, observability guide, validation and teardown all meet the definition below.

## When a provider is done

A provider is complete only when a student, using their own account or private cloud, can:

- install the command-line tools it needs and check that they work;
- sign in without any credentials stored in the repository;
- set up Terraform and review a plan;
- create the Kubernetes cluster and the registry, identity and networking it needs;
- build and push the standard container image, or point to it;
- deploy the shared Kubernetes workload;
- check health and readiness, and send the app a real request;
- find the app's metrics, logs and traces;
- see basic resource and cost information for that provider;
- move the same tested image through dev, qa, staging and prod;
- run validation on its own, separate from deployment;
- delete the lab resources and confirm they're gone.

## Safety and cost controls

Labs start with the smallest setup that works, never production-sized. You always run `plan` before `deploy`, and commands that delete things require you to name the provider and environment. The docs must point out resources that keep costing money until they're deleted, and show how to confirm teardown. CI validates configuration and contracts without provisioning billable infrastructure by default.

## Build order

The work happens one step at a time, and each step must be merged before the next one starts:

1. Platform contract and skeleton.
2. AWS adapter reconciliation.
3. GCP adapter reconciliation.
4. Azure adapter parity.
5. OpenStack private-cloud adapter.
6. Cross-provider OpenTelemetry observability contract.
7. Optional Korifi / Cloud Foundry workflow.
8. End-to-end residency validation and documentation audit.

Each new provider PR starts from the latest `main`. Provider material that already works is reused or reworked, not copied.