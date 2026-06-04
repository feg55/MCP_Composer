from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

try:  # MCP SDK versions have used both module/function naming styles.
    from mcp.client.streamable_http import streamablehttp_client
except ImportError:  # pragma: no cover - depends on installed SDK version.
    streamablehttp_client = None  # type: ignore[assignment]

try:
    from mcp.client.sse import sse_client
except ImportError:  # pragma: no cover - SSE may be absent in newer SDKs.
    sse_client = None  # type: ignore[assignment]

from app.core.catalog import namespace_tool_name
from app.core.connectors.base import McpConnector
from app.core.risk import default_permission_for_risk, detect_tool_risk
from app.core.types import McpServerDefinition, McpToolDefinition, TestConnectionResponse


DEFAULT_TIMEOUT_SECONDS = 20


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


def _resolved_env(server: McpServerDefinition) -> dict[str, str] | None:
    if not server.env:
        return None
    env = os.environ.copy()
    for key, value in server.env.items():
        env[key] = _resolve_env_value(value)
    return env


def _resolve_env_value(value: str) -> str:
    stripped = value.strip()
    if stripped.startswith("${") and stripped.endswith("}"):
        return os.getenv(stripped[2:-1], "")
    return value


def _resolved_args(server: McpServerDefinition) -> list[str]:
    return [_resolve_env_value(arg) for arg in server.args]


def _missing_env_keys(server: McpServerDefinition) -> list[str]:
    missing: list[str] = []
    for key, value in server.env.items():
        stripped = value.strip()
        if stripped.startswith("${") and stripped.endswith("}") and not os.getenv(stripped[2:-1]):
            missing.append(key)
    return missing


class McpSdkConnector(McpConnector):
    """MCP SDK-backed connector used by the builder API and generated gateway."""

    def __init__(self, timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS) -> None:
        self.timeout_seconds = timeout_seconds

    async def list_tools(self, server: McpServerDefinition) -> list[McpToolDefinition]:
        if server.status == "disabled":
            return []

        async def operation() -> list[McpToolDefinition]:
            async with self._session(server) as session:
                result = await session.list_tools()
                sdk_tools = _get_attr(result, "tools", default=[])
                return [self._to_tool_definition(server, tool) for tool in sdk_tools]

        return await asyncio.wait_for(operation(), timeout=self.timeout_seconds)

    async def test_connection(self, server: McpServerDefinition) -> TestConnectionResponse:
        preflight_error = self._preflight_error(server)
        if preflight_error:
            return TestConnectionResponse(status="error", message=preflight_error)

        missing_env = _missing_env_keys(server)
        if missing_env:
            return TestConnectionResponse(
                status="needs_auth",
                message=f"Missing environment values for: {', '.join(missing_env)}.",
            )

        try:
            tools = await self.list_tools(server)
        except TimeoutError:
            return TestConnectionResponse(status="error", message=f"Connection timed out after {self.timeout_seconds}s.")
        except Exception as exc:  # noqa: BLE001 - surface upstream SDK errors as API data.
            return TestConnectionResponse(status="error", message=str(exc))
        return TestConnectionResponse(status="ready", message=f"Connected. Discovered {len(tools)} tools.")

    async def call_tool(
        self,
        server: McpServerDefinition,
        tool: McpToolDefinition,
        input_payload: dict[str, Any],
    ) -> dict[str, Any]:
        if tool.permission == "disabled":
            raise PermissionError("Tool is disabled by policy.")
        preflight_error = self._preflight_error(server)
        if preflight_error:
            raise RuntimeError(preflight_error)
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

        return await asyncio.wait_for(operation(), timeout=self.timeout_seconds)

    @asynccontextmanager
    async def _session(self, server: McpServerDefinition) -> AsyncIterator[ClientSession]:
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
        if streamablehttp_client is not None:
            try:
                async with streamablehttp_client(server.url) as streams:
                    read_stream, write_stream = streams[0], streams[1]
                    async with ClientSession(read_stream, write_stream) as session:
                        await session.initialize()
                        yield session
                        return
            except Exception:
                if sse_client is None:
                    raise

        if sse_client is None:
            raise RuntimeError("Installed MCP SDK does not provide an HTTP client transport.")
        async with sse_client(server.url) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                yield session

    def _preflight_error(self, server: McpServerDefinition) -> str | None:
        if server.status == "disabled":
            return "Server is disabled."
        if server.transport == "stdio" and not server.command:
            return "stdio MCP server requires a command."
        if server.transport == "http" and not server.url:
            return "http MCP server requires a URL."
        return None

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
