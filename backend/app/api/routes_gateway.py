from __future__ import annotations

from fastapi import APIRouter

from app.core.gateway import generate_gateway_response
from app.core.types import GeneratedGatewayResponse, McpComposition


router = APIRouter(prefix="/api", tags=["gateway"])


@router.post("/generate-gateway", response_model=GeneratedGatewayResponse)
async def generate_gateway(composition: McpComposition) -> GeneratedGatewayResponse:
    return generate_gateway_response(composition)

