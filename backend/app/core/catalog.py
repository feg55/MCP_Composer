from __future__ import annotations

import base64
import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import httpx

from app.core.types import CatalogSearchResponse, CatalogServerDefinition, CatalogSourceStatus, McpServerDefinition


CATALOG_PATH = Path(__file__).resolve().parents[1] / "data" / "server_templates.json"
OFFICIAL_REGISTRY_URL = os.getenv("MCP_OFFICIAL_REGISTRY_URL", "https://registry.modelcontextprotocol.io/v0.1/servers")
PULSEMCP_REGISTRY_URL = os.getenv("PULSEMCP_REGISTRY_URL", "https://api.pulsemcp.com/v0.1/servers")
SMITHERY_REGISTRY_URL = os.getenv("SMITHERY_REGISTRY_URL", "https://api.smithery.ai/servers")
GLAMA_REGISTRY_URL = os.getenv("GLAMA_REGISTRY_URL", "https://glama.ai/api/mcp/v1/servers")
HTTP_TIMEOUT_SECONDS = 5.0


class CatalogProviderResult:
    def __init__(
        self,
        source: CatalogSourceStatus,
        servers: list[CatalogServerDefinition] | None = None,
        next_cursor: str | None = None,
    ) -> None:
        self.source = source
        self.servers = servers or []
        self.next_cursor = next_cursor


def namespace_tool_name(server: McpServerDefinition | dict, tool_name: str) -> str:
    if isinstance(server, dict):
        raw = str(server.get("name") or server.get("id") or "server")
    else:
        raw = server.name or server.id
    prefix = raw.lower().replace(" mcp", "").replace("mcp", "")
    cleaned = "".join(char if char.isalnum() else "_" for char in prefix).strip("_")
    cleaned = "_".join(part for part in cleaned.split("_") if part)
    return f"{cleaned or 'server'}.{tool_name}"


def _prepare_server(payload: dict) -> McpServerDefinition:
    prepared = dict(payload)
    prepared["tools"] = payload.get("tools", [])
    return McpServerDefinition(**prepared)


@lru_cache(maxsize=1)
def get_catalog() -> list[McpServerDefinition]:
    raw = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    return [_prepare_server(item) for item in raw["servers"]]


def get_catalog_json() -> list[dict]:
    return [server.model_dump(mode="json") for server in get_catalog()]


def _slugify(value: str) -> str:
    cleaned = "".join(char.lower() if char.isalnum() else "-" for char in value)
    cleaned = "-".join(part for part in cleaned.split("-") if part)
    return cleaned or "mcp-server"


def _text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _first_dict(values: Any) -> dict[str, Any] | None:
    if isinstance(values, list):
        return next((item for item in values if isinstance(item, dict)), None)
    return None


def _decode_cursor(cursor: str | None) -> dict[str, Any]:
    if not cursor:
        return {"sourceCursors": {}, "buffer": [], "seen": []}
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("utf-8")).decode("utf-8")
        payload = json.loads(raw)
    except Exception:
        return {"sourceCursors": {}, "buffer": [], "seen": []}
    if not isinstance(payload, dict):
        return {"sourceCursors": {}, "buffer": [], "seen": []}
    payload.setdefault("sourceCursors", {})
    payload.setdefault("buffer", [])
    payload.setdefault("seen", [])
    return payload


def _encode_cursor(payload: dict[str, Any]) -> str | None:
    source_cursors = {key: value for key, value in payload.get("sourceCursors", {}).items() if value}
    buffer = payload.get("buffer", [])
    if not source_cursors and not buffer:
        return None
    encoded = json.dumps(
        {
            "sourceCursors": source_cursors,
            "buffer": buffer,
            "seen": payload.get("seen", [])[-500:],
        },
        separators=(",", ":"),
    )
    return base64.urlsafe_b64encode(encoded.encode("utf-8")).decode("utf-8")


def _dedupe_key(server: CatalogServerDefinition) -> str:
    for value in (server.repositoryUrl, server.packageId, server.remoteUrl, server.externalUrl, server.id):
        if value:
            return value.lower().rstrip("/")
    return server.name.lower()


def _catalog_server_from_template(server: McpServerDefinition) -> CatalogServerDefinition:
    return CatalogServerDefinition(
        **server.model_dump(mode="json"),
        catalogSources=[server.source],
        installHint="starter template",
    )


def _server_matches_query(server: CatalogServerDefinition, query: str) -> bool:
    normalized = query.strip().lower()
    if not normalized:
        return True
    haystack = " ".join(
        [
            server.name,
            server.description,
            server.transport,
            server.source,
            server.repositoryUrl or "",
            server.packageId or "",
            server.remoteUrl or "",
            *server.tags,
            *server.catalogSources,
        ]
    ).lower()
    return normalized in haystack


def _server_status(env: dict[str, str], command: str | None, url: str | None) -> str:
    if any(value.startswith("${") and value.endswith("}") for value in env.values()):
        return "needs_auth"
    if not command and not url:
        return "needs_auth"
    return "ready"


def _runtime_from_server_json(server: dict[str, Any]) -> tuple[str, str | None, list[str], str | None, dict[str, str], str | None, str | None]:
    packages = server.get("packages") if isinstance(server.get("packages"), list) else []
    package = _first_dict(packages)
    if package:
        identifier = _text(package.get("identifier"))
        registry_type = _text(package.get("registryType") or package.get("registry_type")).lower()
        env: dict[str, str] = {}
        for item in package.get("environmentVariables") or package.get("environment_variables") or []:
            if isinstance(item, dict):
                name = _text(item.get("name"))
                if name:
                    env[name] = f"${{{name}}}"
        if identifier and registry_type == "npm":
            return "stdio", "npx", ["-y", identifier], None, env, identifier, f"npx -y {identifier}"
        if identifier and registry_type in {"pypi", "python"}:
            return "stdio", "uvx", [identifier], None, env, identifier, f"uvx {identifier}"

    remotes = server.get("remotes") if isinstance(server.get("remotes"), list) else []
    remote = _first_dict(remotes)
    remote_url = _text(remote.get("url")) if remote else ""
    if remote_url and "{" not in remote_url and "}" not in remote_url:
        return "http", None, [], remote_url, {}, None, remote_url

    return "stdio", None, [], None, {}, None, None


def _catalog_server_from_registry_entry(source: str, entry: dict[str, Any]) -> CatalogServerDefinition | None:
    server = entry.get("server") if isinstance(entry.get("server"), dict) else entry
    if not isinstance(server, dict):
        return None

    title = _text(server.get("title") or server.get("displayName") or server.get("name"), "MCP Server")
    raw_name = _text(server.get("name") or title)
    description = _text(server.get("description"), "MCP server discovered from an external registry.")
    repository = server.get("repository") if isinstance(server.get("repository"), dict) else {}
    repository_url = _text(repository.get("url")) if repository else ""
    homepage_url = _text(server.get("websiteUrl") or server.get("homepage") or server.get("homepageUrl"))
    transport, command, args, url, env, package_id, install_hint = _runtime_from_server_json(server)
    source_label = "official" if source == "official" else source
    tags = [source_label]
    if package_id:
        tags.append("package")
    if url:
        tags.append("remote")
    if repository_url:
        tags.append("github" if "github.com" in repository_url else "repository")

    meta = entry.get("_meta") if isinstance(entry.get("_meta"), dict) else {}
    pulse_meta = meta.get("com.pulsemcp/server") if isinstance(meta.get("com.pulsemcp/server"), dict) else {}
    popularity = pulse_meta.get("visitorsEstimateLastFourWeeks") or pulse_meta.get("visitorsEstimateTotal")

    return CatalogServerDefinition(
        id=f"{source}-{_slugify(raw_name or title)}",
        name=title,
        description=description,
        transport=transport,  # type: ignore[arg-type]
        source=source,  # type: ignore[arg-type]
        command=command,
        args=args,
        url=url,
        env=env,
        tags=tags,
        status=_server_status(env, command, url),  # type: ignore[arg-type]
        tools=[],
        catalogSources=[source_label],
        repositoryUrl=repository_url or None,
        homepageUrl=homepage_url or None,
        packageId=package_id,
        remoteUrl=url,
        installHint=install_hint,
        externalUrl=homepage_url or repository_url or None,
        verified=bool(pulse_meta.get("isOfficial")),
        popularity=popularity if isinstance(popularity, int) else None,
    )


def _catalog_server_from_smithery(entry: dict[str, Any]) -> CatalogServerDefinition | None:
    qualified_name = _text(entry.get("qualifiedName") or entry.get("qualified_name"))
    title = _text(entry.get("displayName") or qualified_name or entry.get("name"), "Smithery MCP Server")
    if not qualified_name and not title:
        return None
    homepage = _text(entry.get("homepage"))
    tags = ["smithery"]
    if entry.get("remote"):
        tags.append("remote")
    if entry.get("verified"):
        tags.append("verified")
    return CatalogServerDefinition(
        id=f"smithery-{_slugify(qualified_name or title)}",
        name=title,
        description=_text(entry.get("description"), "MCP server indexed by Smithery."),
        transport="http" if entry.get("remote") else "stdio",
        source="smithery",
        command=None,
        args=[],
        url=None,
        env={},
        tags=tags,
        status="needs_auth",
        tools=[],
        catalogSources=["smithery"],
        homepageUrl=homepage or None,
        packageId=qualified_name or None,
        installHint=qualified_name or None,
        externalUrl=homepage or (f"https://smithery.ai/server/{qualified_name}" if qualified_name else None),
        verified=bool(entry.get("verified")),
        popularity=entry.get("useCount") if isinstance(entry.get("useCount"), int) else None,
    )


def _catalog_server_from_glama(entry: dict[str, Any]) -> CatalogServerDefinition | None:
    namespace = _text(entry.get("namespace") or entry.get("owner") or entry.get("author"))
    slug = _text(entry.get("slug") or entry.get("name") or entry.get("id"))
    title = _text(entry.get("title") or entry.get("displayName") or entry.get("name") or slug, "Glama MCP Server")
    if not title:
        return None
    repository = entry.get("repository") if isinstance(entry.get("repository"), dict) else {}
    repository_url = _text(repository.get("url") or entry.get("repositoryUrl") or entry.get("sourceUrl"))
    external_url = f"https://glama.ai/mcp/servers/{namespace}/{slug}" if namespace and slug else _text(entry.get("url"))
    tags = ["glama"]
    if namespace:
        tags.append(namespace)
    return CatalogServerDefinition(
        id=f"glama-{_slugify(namespace + '-' + slug if namespace and slug else title)}",
        name=title,
        description=_text(entry.get("description"), "MCP server indexed by Glama."),
        transport="stdio",
        source="glama",
        command=None,
        args=[],
        url=None,
        env={},
        tags=tags,
        status="needs_auth",
        tools=[],
        catalogSources=["glama"],
        repositoryUrl=repository_url or None,
        homepageUrl=_text(entry.get("homepageUrl") or entry.get("websiteUrl")) or None,
        externalUrl=external_url or None,
        verified=bool(entry.get("verified") or entry.get("isVerified")),
        popularity=entry.get("score") if isinstance(entry.get("score"), int) else None,
    )


async def _local_provider(query: str, limit: int, cursor: str | None) -> CatalogProviderResult:
    offset = int(cursor or 0) if str(cursor or "").isdigit() else 0
    items = [_catalog_server_from_template(server) for server in get_catalog()]
    filtered = [server for server in items if _server_matches_query(server, query)]
    page = filtered[offset : offset + limit]
    next_offset = offset + len(page)
    next_cursor = str(next_offset) if next_offset < len(filtered) else None
    return CatalogProviderResult(
        CatalogSourceStatus(id="local", label="Starter templates", enabled=True, ok=True),
        page,
        next_cursor,
    )


def _extract_server_entries(payload: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ("servers", "items", "nodes", "data"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    if isinstance(payload.get("data"), dict):
        return _extract_server_entries(payload["data"])
    return []


def _extract_next_cursor(payload: dict[str, Any]) -> str | None:
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    page_info = payload.get("pageInfo") if isinstance(payload.get("pageInfo"), dict) else {}
    pagination = payload.get("pagination") if isinstance(payload.get("pagination"), dict) else {}
    next_cursor = metadata.get("nextCursor") or page_info.get("endCursor") or payload.get("nextCursor")
    if next_cursor:
        return str(next_cursor)
    if page_info.get("hasNextPage") and page_info.get("endCursor"):
        return str(page_info["endCursor"])
    current_page = pagination.get("currentPage")
    total_pages = pagination.get("totalPages")
    if isinstance(current_page, int) and isinstance(total_pages, int) and current_page < total_pages:
        return str(current_page + 1)
    return None


async def _registry_provider(
    *,
    source: str,
    label: str,
    base_url: str,
    query: str,
    limit: int,
    cursor: str | None,
    headers: dict[str, str] | None = None,
    extra_params: dict[str, str] | None = None,
) -> CatalogProviderResult:
    params: dict[str, str | int] = {"limit": min(limit, 100)}
    if query:
        params["search"] = query
    if cursor:
        params["cursor"] = cursor
    if extra_params:
        params.update(extra_params)
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
            response = await client.get(base_url, params=params, headers=headers)
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:  # noqa: BLE001 - external registry failures should not break local catalog.
        return CatalogProviderResult(
            CatalogSourceStatus(id=source, label=label, enabled=True, ok=False, message=str(exc)),
        )
    entries = _extract_server_entries(payload if isinstance(payload, dict) else {})
    servers = [
        server
        for entry in entries
        if (server := _catalog_server_from_registry_entry(source, entry)) is not None
    ]
    return CatalogProviderResult(
        CatalogSourceStatus(id=source, label=label, enabled=True, ok=True),
        servers,
        _extract_next_cursor(payload if isinstance(payload, dict) else {}),
    )


async def _official_provider(query: str, limit: int, cursor: str | None) -> CatalogProviderResult:
    return await _registry_provider(
        source="official",
        label="Official MCP Registry",
        base_url=OFFICIAL_REGISTRY_URL,
        query=query,
        limit=limit,
        cursor=cursor,
        extra_params={"version": "latest"},
    )


async def _pulsemcp_provider(query: str, limit: int, cursor: str | None) -> CatalogProviderResult:
    api_key = os.getenv("PULSEMCP_API_KEY")
    tenant_id = os.getenv("PULSEMCP_TENANT_ID")
    if not api_key or not tenant_id:
        return CatalogProviderResult(
            CatalogSourceStatus(
                id="pulsemcp",
                label="PulseMCP",
                enabled=False,
                ok=True,
                message="Set PULSEMCP_API_KEY and PULSEMCP_TENANT_ID to enable.",
            )
        )
    return await _registry_provider(
        source="pulsemcp",
        label="PulseMCP",
        base_url=PULSEMCP_REGISTRY_URL,
        query=query,
        limit=limit,
        cursor=cursor,
        headers={"X-API-Key": api_key, "X-Tenant-ID": tenant_id},
        extra_params={"version": "latest"},
    )


async def _smithery_provider(query: str, limit: int, cursor: str | None) -> CatalogProviderResult:
    api_key = os.getenv("SMITHERY_API_KEY")
    if not api_key:
        return CatalogProviderResult(
            CatalogSourceStatus(
                id="smithery",
                label="Smithery",
                enabled=False,
                ok=True,
                message="Set SMITHERY_API_KEY to enable.",
            )
        )
    page = int(cursor or 1) if str(cursor or "").isdigit() else 1
    params: dict[str, str | int] = {"page": page, "pageSize": min(limit, 100), "seed": 1}
    if query:
        params["q"] = query
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
            response = await client.get(SMITHERY_REGISTRY_URL, params=params, headers={"Authorization": f"Bearer {api_key}"})
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:  # noqa: BLE001
        return CatalogProviderResult(CatalogSourceStatus(id="smithery", label="Smithery", enabled=True, ok=False, message=str(exc)))
    entries = _extract_server_entries(payload if isinstance(payload, dict) else {})
    servers = [server for entry in entries if (server := _catalog_server_from_smithery(entry)) is not None]
    return CatalogProviderResult(
        CatalogSourceStatus(id="smithery", label="Smithery", enabled=True, ok=True),
        servers,
        _extract_next_cursor(payload if isinstance(payload, dict) else {}),
    )


async def _glama_provider(query: str, limit: int, cursor: str | None) -> CatalogProviderResult:
    params: dict[str, str | int] = {"first": min(limit, 100)}
    if query:
        params["query"] = query
    if cursor:
        params["after"] = cursor
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
            response = await client.get(GLAMA_REGISTRY_URL, params=params)
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:  # noqa: BLE001
        return CatalogProviderResult(CatalogSourceStatus(id="glama", label="Glama", enabled=True, ok=False, message=str(exc)))
    entries = _extract_server_entries(payload if isinstance(payload, dict) else {})
    servers = [server for entry in entries if (server := _catalog_server_from_glama(entry)) is not None]
    return CatalogProviderResult(
        CatalogSourceStatus(id="glama", label="Glama", enabled=True, ok=True),
        servers,
        _extract_next_cursor(payload if isinstance(payload, dict) else {}),
    )


async def search_catalog(
    query: str = "",
    cursor: str | None = None,
    limit: int = 30,
    include_external: bool = False,
) -> CatalogSearchResponse:
    limit = max(1, min(limit, 100))
    cursor_payload = _decode_cursor(cursor)
    source_cursors: dict[str, str | None] = {
        key: value for key, value in cursor_payload.get("sourceCursors", {}).items() if isinstance(key, str)
    }
    buffer_payload = [item for item in cursor_payload.get("buffer", []) if isinstance(item, dict)]
    buffered = [CatalogServerDefinition(**item) for item in buffer_payload]
    returned_seen = {item for item in cursor_payload.get("seen", []) if isinstance(item, str)}
    request_keys = set(returned_seen)

    items: list[CatalogServerDefinition] = []
    for server in buffered:
        key = _dedupe_key(server)
        if key in request_keys:
            continue
        request_keys.add(key)
        items.append(server)

    providers = [("local", _local_provider)]
    if include_external:
        providers.extend(
            [
                ("official", _official_provider),
                ("glama", _glama_provider),
                ("smithery", _smithery_provider),
                ("pulsemcp", _pulsemcp_provider),
            ]
        )

    source_statuses: list[CatalogSourceStatus] = []
    if len(items) < limit:
        for source_id, provider in providers:
            result = await provider(query, limit, source_cursors.get(source_id))
            source_statuses.append(result.source)
            source_cursors[source_id] = result.next_cursor
            for server in result.servers:
                key = _dedupe_key(server)
                if key in request_keys:
                    continue
                request_keys.add(key)
                items.append(server)
    else:
        source_statuses = [CatalogSourceStatus(id="buffer", label="Buffered results", enabled=True, ok=True)]

    page = items[:limit]
    rest = [server.model_dump(mode="json") for server in items[limit:]]
    next_seen = set(returned_seen)
    for server in page:
        next_seen.add(_dedupe_key(server))
    next_cursor = _encode_cursor({"sourceCursors": source_cursors, "buffer": rest, "seen": sorted(next_seen)})
    return CatalogSearchResponse(servers=page, nextCursor=next_cursor, sources=source_statuses)
