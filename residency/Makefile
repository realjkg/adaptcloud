SHELL := /bin/bash
PROVIDER ?=
ENV ?= dev
FROM ?=
TO ?=

.PHONY: doctor init plan deploy validate observe promote destroy

check-provider:
	@test -n "$(PROVIDER)" || { echo "PROVIDER is required (aws|azure|gcp|openstack)"; exit 2; }
	@case "$(PROVIDER)" in aws|azure|gcp|openstack) ;; *) echo "Unsupported PROVIDER=$(PROVIDER)"; exit 2;; esac

check-env:
	@case "$(ENV)" in dev|qa|staging|prod) ;; *) echo "ENV must be dev|qa|staging|prod"; exit 2;; esac

doctor init plan deploy validate observe destroy: check-provider check-env
	@./cli/residency.sh $@ "$(PROVIDER)" "$(ENV)"

promote: check-provider
	@test -n "$(FROM)" -a -n "$(TO)" || { echo "FROM and TO are required"; exit 2; }
	@./cli/residency.sh promote "$(PROVIDER)" "$(FROM)" "$(TO)"
