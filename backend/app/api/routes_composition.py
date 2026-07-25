from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import APIRouter, HTTPException, Request

from app.core.composition import normalize_server_config, validate_composition
from app.core.connectors.mcp_connector import McpSdkConnector
from app.core.types import (
    McpComposition,
    McpServerDefinition,
    TestConnectionResponse,
    ToolDiscoveryResponse,
    ValidationResult,
)

router = APIRouter(prefix="/api", tags=["composition"])
UPSTREAM_REQUEST_CONCURRENCY = 4
_upstream_request_slots = asyncio.Semaphore(UPSTREAM_REQUEST_CONCURRENCY)


@asynccontextmanager
async def _upstream_request_slot() -> AsyncIterator[None]:
    if _upstream_request_slots.locked():
        raise HTTPException(
            status_code=503,
            detail="Upstream MCP capacity is busy. Retry shortly.",
            headers={"Retry-After": "1"},
        )

    await _upstream_request_slots.acquire()
    try:
        yield
    finally:
        _upstream_request_slots.release()


@router.post("/validate-composition", response_model=ValidationResult)
async def validate(composition: McpComposition) -> ValidationResult:
    return validate_composition(composition)


@router.post("/test-connection", response_model=TestConnectionResponse)
async def test_connection(
    server: McpServerDefinition,
    request: Request,
) -> TestConnectionResponse:
    connector = McpSdkConnector(settings=request.app.state.settings)
    normalized = normalize_server_config(server)
    async with _upstream_request_slot():
        return await connector.test_connection(normalized)


@router.post("/discover-tools", response_model=ToolDiscoveryResponse)
async def discover_tools(
    server: McpServerDefinition,
    request: Request,
) -> ToolDiscoveryResponse:
    connector = McpSdkConnector(settings=request.app.state.settings)
    normalized = normalize_server_config(server)
    async with _upstream_request_slot():
        connection, tools = await connector.test_connection_with_tools(normalized)
    if connection.status != "ready":
        return ToolDiscoveryResponse(status=connection.status, message=connection.message, tools=[])
    return ToolDiscoveryResponse(
        status="ready", message=f"Discovered {len(tools)} tools.", tools=tools
    )
