.PHONY: backend frontend dev build check backend-install
.PHONY: docker-build docker-up docker-down docker-logs docker-smoke

BACKEND_VENV := backend/.venv
BACKEND_PY := $(BACKEND_VENV)/bin/python

$(BACKEND_PY):
	cd backend && python -m venv .venv

backend-install: $(BACKEND_PY)
	cd backend && .venv/bin/python -m pip install --require-hashes -r requirements-dev.txt

backend: backend-install
	cd backend && APP_MODE=local MCP_COMPOSER_ALLOWED_ORIGINS=$${MCP_COMPOSER_ALLOWED_ORIGINS:-http://localhost:5173,http://127.0.0.1:5173} .venv/bin/uvicorn app.main:app --reload

frontend:
	cd frontend && npm ci && npm run dev

dev:
	$(MAKE) -j2 backend frontend

check: backend-install
	cd backend && .venv/bin/ruff check .
	cd backend && .venv/bin/ruff format --check .
	cd backend && .venv/bin/python -m compileall app
	cd backend && .venv/bin/python -m pytest
	cd frontend && npm ci
	cd frontend && npm run check

build:
	cd frontend && npm ci && npm run build

docker-build:
	docker compose build --pull composer

docker-up:
	docker compose up --build --wait --wait-timeout 60

docker-down:
	docker compose down --remove-orphans

docker-logs:
	docker compose logs --follow composer

docker-smoke:
	@set -eu; \
	project="mcp-composer-smoke"; \
	port="$${MCP_COMPOSER_SMOKE_PORT:-18080}"; \
	base_url="http://127.0.0.1:$$port"; \
	cleanup() { \
		MCP_COMPOSER_PORT="$$port" docker compose --project-name "$$project" down --remove-orphans >/dev/null 2>&1 || true; \
	}; \
	trap cleanup EXIT INT TERM; \
	MCP_COMPOSER_PORT="$$port" docker compose --project-name "$$project" up --build --wait --wait-timeout 60; \
	health="$$(curl --fail --silent --show-error "$$base_url/api/health")"; \
	printf '%s' "$$health" | grep --fixed-strings '"status":"ok"' >/dev/null; \
	index_html="$$(curl --fail --silent --show-error "$$base_url/")"; \
	printf '%s' "$$index_html" | grep --fixed-strings '<div id="root"></div>' >/dev/null; \
	curl --fail --silent --show-error --head "$$base_url/" >/dev/null; \
	asset_path="$$(printf '%s' "$$index_html" | grep --only-matching --extended-regexp '/assets/[^"]+\.js' | head -n 1)"; \
	test -n "$$asset_path"; \
	curl --fail --silent --show-error "$$base_url$$asset_path" >/dev/null
