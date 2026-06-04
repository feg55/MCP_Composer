from __future__ import annotations

from fastapi import APIRouter

from app.core.connectors.mcp_connector import McpSdkConnector
from app.core.gateway import proxy_tool_call
from app.core.types import ProxyToolCallRequest, ProxyToolCallResponse


router = APIRouter(prefix="/api", tags=["proxy"])
connector = McpSdkConnector()


@router.post("/proxy-tool-call", response_model=ProxyToolCallResponse)
async def proxy(request: ProxyToolCallRequest) -> ProxyToolCallResponse:
    return await proxy_tool_call(request, connector)
