# MCP Composer

FastAPI + React dashboard for composing one task-specific MCP gateway from multiple upstream MCP servers.

## Features

- MCP server catalog and manual server setup.
- Live tool discovery through the MCP Python SDK.
- Tool selection, aliases, risk levels, and permission modes.
- Composition validation with warnings.
- Gateway config generation and export snippets.
- React + Vite + TypeScript + Tailwind frontend.
- FastAPI backend with Pydantic v2 models.

## Project Structure

```text
backend/
  app/
    api/              FastAPI routes
    core/             composition, catalog, gateway, connector logic
    data/             starter MCP server templates
    generated/        local generated gateway configs, ignored by git
    gateway_server.py generated gateway runtime
    main.py           FastAPI app entrypoint
  tests/
  requirements.txt

frontend/
  src/
    components/
    lib/
    App.tsx
    main.tsx
  package.json
  vite.config.ts
```

## Requirements

- Python 3.11+
- Node.js 18+
- npm

## Backend

PowerShell:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:FRONTEND_ORIGIN="http://localhost:5173"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Bash:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
FRONTEND_ORIGIN=http://localhost:5173 uvicorn app.main:app --reload
```

Backend URL: `http://localhost:8000`

Health check: `http://localhost:8000/api/health`

## Frontend

PowerShell:

```powershell
cd frontend
npm install
$env:VITE_API_BASE_URL="http://localhost:8000"
npm run dev
```

Bash:

```bash
cd frontend
npm install
VITE_API_BASE_URL=http://localhost:8000 npm run dev
```

Frontend URL: `http://localhost:5173`

## Environment

Backend:

```text
FRONTEND_ORIGIN=http://localhost:5173
```

Frontend:

```text
VITE_API_BASE_URL=http://localhost:8000
```

Frontend example file: `frontend/.env.example`

## Checks

Backend:

```powershell
cd backend
.\.venv\Scripts\python.exe -m compileall app
.\.venv\Scripts\python.exe -m pytest
```

Frontend:

```powershell
cd frontend
npm run build
```

## Makefile

On Unix-like shells:

```bash
make backend
make frontend
make dev
make check
```

Note: the current `Makefile` uses Unix-style virtualenv paths, so on Windows PowerShell use the commands above.

## Generated Gateway

After generating a gateway in the UI, run it from `backend`:

```bash
python -m app.gateway_server --config ./app/generated/<gateway>.gateway.config.json
```

Example MCP client snippet:

```json
{
  "mcpServers": {
    "code-review-gateway": {
      "command": "python",
      "args": [
        "-m",
        "app.gateway_server",
        "--config",
        "./app/generated/code-review-gateway.gateway.config.json"
      ],
      "env": {
        "MCP_COMPOSER_CONFIG": "./app/generated/code-review-gateway.gateway.config.json"
      }
    }
  }
}
```

Generated JSON files in `backend/app/generated/` are ignored by git.
