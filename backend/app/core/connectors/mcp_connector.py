from __future__ import annotations

import asyncio
import ipaddress
import json
import os
import re
import socket
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator
from urllib.parse import urlsplit

import anyio
import httpx
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

try:  # MCP SDK versions have used both module/function naming styles.
    from mcp.client.streamable_http import streamable_http_client
except ImportError:  # pragma: no cover - depends on installed SDK version.
    streamable_http_client = None  # type: ignore[assignment]

try:
    from mcp.client.sse import sse_client
except ImportError:  # pragma: no cover - SSE may be absent in newer SDKs.
    sse_client = None  # type: ignore[assignment]

from app.core.catalog import namespace_tool_name
from app.core.connectors.base import McpConnector
from app.core.risk import default_permission_for_risk, detect_tool_risk
from app.core.settings import Settings, get_settings
from app.core.types import McpServerDefinition, McpToolDefinition, TestConnectionResponse

DEFAULT_TIMEOUT_SECONDS = 20
MAX_DISCOVERED_TOOLS = 500
MAX_INPUT_SCHEMA_BYTES = 128 * 1024
MAX_DISCOVERED_TOOLS_BYTES = 2 * 1024 * 1024
SAFE_PROCESS_ENV_KEYS = (
    "COMSPEC",
    "HOME",
    "LANG",
    "LC_ALL",
    "NPM_CONFIG_CACHE",
    "NPM_CONFIG_FUND",
    "NPM_CONFIG_UPDATE_NOTIFIER",
    "PATH",
    "PATHEXT",
    "SYSTEMDRIVE",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "WINDIR",
)
ENV_REFERENCE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")


class UpstreamToolsLimitError(ValueError):
    """Raised when an upstream MCP tool catalog exceeds local safety limits."""


def _leaf_exceptions(exc: BaseException) -> list[BaseException]:
    if isinstance(exc, BaseExceptionGroup):
        return [leaf for nested in exc.exceptions for leaf in _leaf_exceptions(nested)]
    return [exc]


def _is_auth_error(exc: BaseException) -> bool:
    for leaf in _leaf_exceptions(exc):
        if isinstance(leaf, httpx.HTTPStatusError) and leaf.response.status_code in {401, 403}:
            return True
        message = str(leaf).lower()
        if any(marker in message for marker in ("401", "403", "unauthorized", "forbidden")):
            return True
    return False


def _upstream_error_message(exc: BaseException) -> str:
    messages = [str(leaf).strip() for leaf in _leaf_exceptions(exc) if str(leaf).strip()]
    return messages[0] if messages else "Upstream MCP connection failed."


def _jsonable(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json", by_alias=True)
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [_jsonable(item) for item in value]
    return value


def _get_attr(value: Any, *names: str, default: Any = None) -> Any:
    for name in names:
        if isinstance(value, dict) and name in value:
            return value[name]
        if hasattr(value, name):
            return getattr(value, name)
    return default


def _resolved_env(server: McpServerDefinition) -> dict[str, str]:
    env = {key: value for key in SAFE_PROCESS_ENV_KEYS if (value := os.getenv(key)) is not None}
    for key, value in server.env.items():
        env[key] = _resolve_env_value(value)
    return env


def _resolved_headers(server: McpServerDefinition) -> dict[str, str]:
    def replace_reference(match: re.Match[str]) -> str:
        key = match.group(1)
        configured = server.env.get(key, f"${{{key}}}")
        return _resolve_env_value(configured)

    return {
        key: ENV_REFERENCE.sub(replace_reference, value) for key, value in server.headers.items()
    }


def _resolve_env_value(value: str) -> str:
    stripped = value.strip()
    if stripped.startswith("${") and stripped.endswith("}"):
        return os.getenv(stripped[2:-1], "")
    return value


def _resolved_args(server: McpServerDefinition) -> list[str]:
    return [_resolve_env_value(arg) for arg in server.args]


def _missing_env_keys(server: McpServerDefinition) -> list[str]:
    missing: set[str] = set()
    for key, value in server.env.items():
        stripped = value.strip()
        if stripped.startswith("${") and stripped.endswith("}") and not os.getenv(stripped[2:-1]):
            missing.add(key)
    for value in server.headers.values():
        for referenced_key in ENV_REFERENCE.findall(value):
            configured = server.env.get(referenced_key, f"${{{referenced_key}}}")
            if not _resolve_env_value(configured):
                missing.add(referenced_key)
    return sorted(missing)


def _is_public_ip(value: str) -> bool:
    try:
        address = ipaddress.ip_address(value.split("%", 1)[0])
    except ValueError:
        return False
    return address.is_global


def _no_redirect_http_client(
    headers: dict[str, str] | None = None,
    timeout: httpx.Timeout | None = None,
    auth: httpx.Auth | None = None,
) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        headers=headers,
        timeout=timeout,
        auth=auth,
        follow_redirects=False,
        trust_env=False,
    )


def _http_transport_kwargs(
    settings: Settings,
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    kwargs: dict[str, Any] = {}
    if headers:
        kwargs["headers"] = headers
    if settings.hosted:
        kwargs["httpx_client_factory"] = _no_redirect_http_client
    return kwargs


async def _hosted_url_error(url: str, allowed_hosts: tuple[str, ...]) -> str | None:
    try:
        parsed = urlsplit(url)
        port = parsed.port or 443
    except ValueError:
        return "Remote MCP URL is invalid."
    if parsed.scheme.lower() != "https":
        return "Hosted mode only permits HTTPS MCP URLs."
    if parsed.username or parsed.password:
        return "Remote MCP URLs must not contain credentials."
    hostname = (parsed.hostname or "").rstrip(".").lower()
    if not hostname:
        return "Remote MCP URL requires a hostname."
    if hostname not in allowed_hosts:
        return "Remote MCP host is not allowlisted."
    if hostname == "localhost" or hostname.endswith(".localhost"):
        return "Private and local MCP targets are blocked in hosted mode."

    try:
        direct_ip = ipaddress.ip_address(hostname.split("%", 1)[0])
    except ValueError:
        direct_ip = None
    if direct_ip is not None:
        if not direct_ip.is_global:
            return "Private and local MCP targets are blocked in hosted mode."
        return None

    try:
        records = await asyncio.to_thread(
            socket.getaddrinfo,
            hostname,
            port,
            type=socket.SOCK_STREAM,
        )
    except OSError:
        return "Remote MCP hostname could not be resolved."
    addresses = {record[4][0] for record in records if record[4]}
    if not addresses:
        return "Remote MCP hostname did not resolve to an address."
    if any(not _is_public_ip(address) for address in addresses):
        return "Private and local MCP targets are blocked in hosted mode."
    return None


class McpSdkConnector(McpConnector):
    """MCP SDK-backed connector used by the builder API and generated gateway."""

    def __init__(
        self,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
        settings: Settings | None = None,
    ) -> None:
        self.timeout_seconds = timeout_seconds
        self.settings = settings or get_settings()

    async def list_tools(self, server: McpServerDefinition) -> list[McpToolDefinition]:
        if server.status == "disabled":
            return []
        await self._ensure_server_allowed(server)

        async def operation() -> list[McpToolDefinition]:
            async with self._session(server) as session:
                result = await session.list_tools()
                sdk_tools = _get_attr(result, "tools", default=[])
                return self._to_tool_definitions(server, sdk_tools)

        with anyio.fail_after(self.timeout_seconds):
            return await operation()

    async def test_connection(self, server: McpServerDefinition) -> TestConnectionResponse:
        connection, _ = await self.test_connection_with_tools(server)
        return connection

    async def test_connection_with_tools(
        self,
        server: McpServerDefinition,
    ) -> tuple[TestConnectionResponse, list[McpToolDefinition]]:
        preflight_error = self._preflight_error(server)
        if preflight_error:
            return TestConnectionResponse(status="error", message=preflight_error), []
        if self.settings.hosted and server.transport == "http":
            hosted_error = await _hosted_url_error(
                server.url or "",
                self.settings.remote_hosts,
            )
            if hosted_error:
                return TestConnectionResponse(status="error", message=hosted_error), []

        missing_env = _missing_env_keys(server)
        if missing_env:
            return (
                TestConnectionResponse(
                    status="needs_auth",
                    message=f"Missing environment values for: {', '.join(missing_env)}.",
                ),
                [],
            )

        try:
            tools = await self.list_tools(server)
        except TimeoutError:
            return (
                TestConnectionResponse(
                    status="error",
                    message=f"Connection timed out after {self.timeout_seconds}s.",
                ),
                [],
            )
        except UpstreamToolsLimitError as exc:
            return TestConnectionResponse(status="error", message=str(exc)), []
        except Exception as exc:  # noqa: BLE001 - surface upstream SDK errors as API data.
            if _is_auth_error(exc):
                return (
                    TestConnectionResponse(
                        status="needs_auth",
                        message="Authentication failed. Check the configured credentials.",
                    ),
                    [],
                )
            message = (
                "Upstream MCP connection failed."
                if self.settings.hosted
                else _upstream_error_message(exc)
            )
            return TestConnectionResponse(status="error", message=message), []
        return (
            TestConnectionResponse(
                status="ready",
                message=f"Connected. Discovered {len(tools)} tools.",
            ),
            tools,
        )

    def _to_tool_definitions(
        self,
        server: McpServerDefinition,
        sdk_tools: Any,
    ) -> list[McpToolDefinition]:
        tools: list[McpToolDefinition] = []
        serialized_tools_bytes = self._serialized_size([])

        try:
            for index, sdk_tool in enumerate(sdk_tools):
                if index >= MAX_DISCOVERED_TOOLS:
                    raise UpstreamToolsLimitError(
                        f"Upstream MCP returned more than {MAX_DISCOVERED_TOOLS} tools."
                    )

                tool = self._to_tool_definition(server, sdk_tool)
                schema_bytes = self._serialized_size(tool.inputSchema)
                if schema_bytes > MAX_INPUT_SCHEMA_BYTES:
                    raise UpstreamToolsLimitError(
                        "An upstream MCP input schema exceeds "
                        f"{MAX_INPUT_SCHEMA_BYTES} serialized bytes."
                    )

                if tools:
                    serialized_tools_bytes += 1
                serialized_tools_bytes += self._serialized_size(
                    tool.model_dump(mode="json", by_alias=True)
                )
                if serialized_tools_bytes > MAX_DISCOVERED_TOOLS_BYTES:
                    raise UpstreamToolsLimitError(
                        f"Upstream MCP tools exceed {MAX_DISCOVERED_TOOLS_BYTES} serialized bytes."
                    )
                tools.append(tool)
        except UpstreamToolsLimitError:
            raise
        except (RecursionError, TypeError, ValueError) as exc:
            raise UpstreamToolsLimitError(
                "Upstream MCP tools could not be safely serialized."
            ) from exc

        return tools

    @staticmethod
    def _serialized_size(value: Any) -> int:
        return len(
            json.dumps(
                value,
                ensure_ascii=False,
                separators=(",", ":"),
                allow_nan=False,
            ).encode("utf-8")
        )

    async def call_tool(
        self,
        server: McpServerDefinition,
        tool: McpToolDefinition,
        input_payload: dict[str, Any],
    ) -> dict[str, Any]:
        if tool.permission == "disabled":
            raise PermissionError("Tool is disabled by policy.")
        if tool.permission == "require_approval":
            raise PermissionError(
                "Tool execution requires approval, but no approval flow is configured."
            )
        preflight_error = self._preflight_error(server)
        if preflight_error:
            raise RuntimeError(preflight_error)
        await self._ensure_server_allowed(server)
        missing_env = _missing_env_keys(server)
        if missing_env:
            raise RuntimeError(f"Missing environment values for: {', '.join(missing_env)}.")

        async def operation() -> dict[str, Any]:
            async with self._session(server) as session:
                result = await session.call_tool(tool.originalName, input_payload)
                return {
                    "serverId": server.id,
                    "originalName": tool.originalName,
                    "exposedName": tool.exposedName,
                    "content": _jsonable(result),
                }

        try:
            with anyio.fail_after(self.timeout_seconds):
                return await operation()
        except TimeoutError:
            raise RuntimeError(f"Connection timed out after {self.timeout_seconds}s.") from None
        except Exception as exc:
            if self.settings.hosted:
                raise RuntimeError("Upstream MCP call failed.") from exc
            raise

    @asynccontextmanager
    async def _session(self, server: McpServerDefinition) -> AsyncIterator[ClientSession]:
        await self._ensure_server_allowed(server)
        if server.transport == "stdio":
            if not server.command:
                raise ValueError("stdio MCP server requires a command.")
            params = StdioServerParameters(
                command=server.command,
                args=_resolved_args(server),
                env=_resolved_env(server),
            )
            async with stdio_client(params) as (read_stream, write_stream):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    yield session
            return

        if not server.url:
            raise ValueError("http MCP server requires a URL.")
        headers = _resolved_headers(server)
        if server.url.rstrip("/").endswith("/sse") and sse_client is not None:
            transport_kwargs = _http_transport_kwargs(self.settings, headers)
            async with sse_client(server.url, **transport_kwargs) as (read_stream, write_stream):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    yield session
            return

        if streamable_http_client is not None:
            timeout = httpx.Timeout(self.timeout_seconds, read=300)
            async with _no_redirect_http_client(headers=headers or None, timeout=timeout) as client:
                async with streamable_http_client(server.url, http_client=client) as streams:
                    read_stream, write_stream = streams[0], streams[1]
                    async with ClientSession(read_stream, write_stream) as session:
                        await session.initialize()
                        yield session
            return

        if sse_client is None:
            raise RuntimeError("Installed MCP SDK does not provide an HTTP client transport.")
        transport_kwargs = _http_transport_kwargs(self.settings, headers)
        async with sse_client(server.url, **transport_kwargs) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                yield session

    def _preflight_error(self, server: McpServerDefinition) -> str | None:
        if server.status == "disabled":
            return "Server is disabled."
        if self.settings.hosted and server.transport == "stdio":
            return "stdio MCP servers are disabled in hosted mode."
        if server.transport == "stdio" and not server.command:
            return "stdio MCP server requires a command."
        if server.transport == "http" and not server.url:
            return "http MCP server requires a URL."
        return None

    async def _ensure_server_allowed(self, server: McpServerDefinition) -> None:
        preflight_error = self._preflight_error(server)
        if preflight_error:
            raise RuntimeError(preflight_error)
        if not self.settings.hosted or server.transport != "http":
            return
        error = await _hosted_url_error(
            server.url or "",
            self.settings.remote_hosts,
        )
        if error:
            raise RuntimeError(error)

    def _to_tool_definition(self, server: McpServerDefinition, sdk_tool: Any) -> McpToolDefinition:
        original_name = str(_get_attr(sdk_tool, "name", default="tool"))
        description = str(_get_attr(sdk_tool, "description", default="") or "")
        input_schema = _get_attr(sdk_tool, "inputSchema", "input_schema", default={}) or {}
        input_schema = _jsonable(input_schema)
        if not isinstance(input_schema, dict):
            input_schema = {"type": "object", "metadata": input_schema}

        risk_level = detect_tool_risk(original_name, description, input_schema)
        return McpToolDefinition(
            id=f"{server.id}-{original_name}",
            serverId=server.id,
            originalName=original_name,
            exposedName=namespace_tool_name(server, original_name),
            description=description,
            inputSchema=input_schema,
            riskLevel=risk_level,
            permission=default_permission_for_risk(risk_level),
            enabled=False,
        )
