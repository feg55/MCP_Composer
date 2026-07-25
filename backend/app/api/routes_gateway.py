from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.core.gateway import InvalidCompositionError, generate_gateway_response
from app.core.types import GeneratedGatewayResponse, McpComposition

router = APIRouter(prefix="/api", tags=["gateway"])


@router.post("/generate-gateway", response_model=GeneratedGatewayResponse)
async def generate_gateway(
    composition: McpComposition,
    request: Request,
) -> GeneratedGatewayResponse:
    settings = request.app.state.settings
    try:
        return generate_gateway_response(
            composition,
            settings.data_dir,
            persist=not settings.hosted,
        )
    except InvalidCompositionError as exc:
        raise HTTPException(
            status_code=422,
            detail={"message": str(exc), "errors": exc.errors},
        ) from exc
