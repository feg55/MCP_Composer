from __future__ import annotations

from fastapi import APIRouter

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
connector = McpSdkConnector()


@router.post("/validate-composition", response_model=ValidationResult)
async def validate(composition: McpComposition) -> ValidationResult:
    return validate_composition(composition)


@router.post("/test-connection", response_model=TestConnectionResponse)
async def test_connection(server: McpServerDefinition) -> TestConnectionResponse:
    normalized = normalize_server_config(server)
    return await connector.test_connection(normalized)


@router.post("/discover-tools", response_model=ToolDiscoveryResponse)
async def discover_tools(server: McpServerDefinition) -> ToolDiscoveryResponse:
    normalized = normalize_server_config(server)
    connection = await connector.test_connection(normalized)
    if connection.status != "ready":
        return ToolDiscoveryResponse(status=connection.status, message=connection.message, tools=[])
    try:
        tools = await connector.list_tools(normalized)
    except Exception as exc:  # noqa: BLE001 - upstream connection failures should be returned as API data.
        return ToolDiscoveryResponse(status="error", message=str(exc), tools=[])
    return ToolDiscoveryResponse(status="ready", message=f"Discovered {len(tools)} tools.", tools=tools)
