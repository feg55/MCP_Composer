from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.core.connectors.mcp_connector import McpSdkConnector
from app.core.gateway import proxy_tool_call
from app.core.types import ProxyToolCallRequest, ProxyToolCallResponse

router = APIRouter(prefix="/api", tags=["proxy"])


@router.post("/proxy-tool-call", response_model=ProxyToolCallResponse)
async def proxy(payload: ProxyToolCallRequest, request: Request) -> ProxyToolCallResponse:
    if request.app.state.settings.hosted:
        raise HTTPException(
            status_code=403,
            detail=(
                "Proxy calls are disabled in hosted mode until tool metadata "
                "and authorization are managed server-side."
            ),
        )
    connector = McpSdkConnector(settings=request.app.state.settings)
    return await proxy_tool_call(payload, connector)
