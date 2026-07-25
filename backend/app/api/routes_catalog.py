from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.core.catalog import get_catalog_json, search_catalog
from app.core.types import CatalogSearchResponse

router = APIRouter(prefix="/api", tags=["catalog"])


@router.get("/catalog")
async def catalog() -> list[dict]:
    return get_catalog_json()


@router.get("/catalog/search", response_model=CatalogSearchResponse)
async def catalog_search(
    q: Annotated[str, Query(max_length=200)] = "",
    cursor: Annotated[str | None, Query(max_length=32_768)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    include_external: bool = False,
) -> CatalogSearchResponse:
    return await search_catalog(
        query=q, cursor=cursor, limit=limit, include_external=include_external
    )
