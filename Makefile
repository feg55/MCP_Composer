.PHONY: backend frontend dev check backend-install

BACKEND_VENV := backend/.venv
BACKEND_PY := $(BACKEND_VENV)/bin/python
BACKEND_UVICORN := $(BACKEND_VENV)/bin/uvicorn

$(BACKEND_PY):
	cd backend && python -m venv .venv

backend-install: $(BACKEND_PY)
	cd backend && .venv/bin/python -m pip install -r requirements.txt

backend: backend-install
	cd backend && FRONTEND_ORIGIN=$${FRONTEND_ORIGIN:-http://localhost:5173} .venv/bin/uvicorn app.main:app --reload

frontend:
	cd frontend && npm install && npm run dev

dev:
	$(MAKE) -j2 backend frontend

check: backend-install
	cd backend && .venv/bin/python -m compileall app
	cd backend && .venv/bin/python -m pytest
	cd frontend && npm install
	cd frontend && npm run build
