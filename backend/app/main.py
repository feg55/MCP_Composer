from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_catalog import router as catalog_router
from app.api.routes_composition import router as composition_router
from app.api.routes_gateway import router as gateway_router
from app.api.routes_proxy import router as proxy_router


FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

app = FastAPI(
    title="MCP Composer API",
    version="0.1.0",
    description="Builder API for composing multiple MCP servers into a single gateway configuration.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in FRONTEND_ORIGIN.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(catalog_router)
app.include_router(composition_router)
app.include_router(gateway_router)
app.include_router(proxy_router)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "mcp-composer-api"}

