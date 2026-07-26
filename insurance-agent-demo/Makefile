SHELL := /bin/bash
COMPOSE ?= docker compose
URL ?= https://localhost

.PHONY: help setup start stop restart logs logs-api status caddy-trust health test-triage clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-14s %s\n", $$1, $$2}'

setup: ## First-time setup: create .env from .env.example if missing
	@if [ ! -f .env ]; then cp .env.example .env; echo "created .env — edit AZURE_OPENAI_ENDPOINT for MODE=azure"; else echo ".env already exists"; fi

start: setup ## Build (if needed) and start the demo stack
	$(COMPOSE) up -d --build
	@echo
	@echo "  UI:      $(URL)"
	@echo "  API:     $(URL)/api/health"
	@echo "  Compose: $$($(COMPOSE) ps --format 'table {{.Service}}\t{{.Status}}')"

stop: ## Stop the stack (keeps images/volumes)
	$(COMPOSE) down

restart: ## Recreate containers to pick up .env changes
	$(COMPOSE) up -d --build --force-recreate

logs: ## Tail all service logs
	$(COMPOSE) logs -f

logs-api: ## Tail API logs only
	$(COMPOSE) logs -f api

status: ## Container health + /health check
	$(COMPOSE) ps
	@echo
	@curl -sk $(URL)/api/health && echo || echo "api not reachable at $(URL)/api/health"

caddy-trust: ## Install Caddy's local CA root cert (run once per machine)
	@echo "→ docker exec insurance-agent-demo-caddy-1 caddy trust  (may need sudo)"
	$(COMPOSE) exec caddy caddy trust || echo "caddy trust returned non-zero — you may need to run 'sudo caddy trust' with the extracted root"

health: ## curl the API's /health once
	@curl -sk $(URL)/api/health || echo "not reachable"

test-triage: ## Send a sample FNOL and pretty-print the result
	@curl -sk -X POST $(URL)/api/triage -H 'Content-Type: application/json' \
	  -d '{"narrative":"Rear-ended at a stop light, minor bumper damage, other driver has insurance."}' \
	  | python3 -m json.tool

clean: ## Down + remove volumes (throws away caddy TLS material)
	$(COMPOSE) down -v
