from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path
from typing import Any

import mcp.types as types
from mcp.server import Server
from mcp.server.stdio import stdio_server

from app.core.connectors.mcp_connector import McpSdkConnector
from app.core.types import McpServerDefinition, McpToolDefinition


def _load_config(path: str | None) -> dict[str, Any]:
    config_path = path or os.getenv("MCP_COMPOSER_CONFIG")
    if not config_path:
        raise SystemExit("Provide --config or MCP_COMPOSER_CONFIG.")
    resolved = Path(config_path).expanduser()
    if not resolved.is_absolute():
        resolved = Path.cwd() / resolved
    return json.loads(resolved.read_text(encoding="utf-8"))


def _server_from_config(payload: dict[str, Any]) -> McpServerDefinition:
    return McpServerDefinition(
        id=payload["id"],
        name=payload.get("name") or payload["id"],
        description=payload.get("description") or "",
        transport=payload["transport"],
        source=payload.get("source") or "manual",
        command=payload.get("command"),
        args=payload.get("args") or [],
        url=payload.get("url"),
        env=payload.get("env") or {},
        tags=payload.get("tags") or [],
        status=payload.get("status") or "ready",
        tools=[],
    )


def _tool_from_route(route: dict[str, Any]) -> McpToolDefinition:
    return McpToolDefinition(
        id=f"{route['serverId']}-{route['originalName']}",
        serverId=route["serverId"],
        originalName=route["originalName"],
        exposedName=route["name"],
        description=route.get("description") or "",
        inputSchema=route.get("inputSchema") or {},
        riskLevel=route.get("riskLevel") or "read",
        permission=route.get("permission") or "auto",
        enabled=True,
    )


def _gateway_name(config: dict[str, Any]) -> str:
    gateway = config.get("gateway") or {}
    return str(gateway.get("slug") or gateway.get("name") or "mcp-composer-gateway")


def build_gateway_app(config: dict[str, Any]) -> Server:
    app = Server(_gateway_name(config))
    connector = McpSdkConnector()
    servers = {
        server["id"]: _server_from_config(server)
        for server in config.get("upstreamServers", [])
    }
    tools = {
        route["name"]: _tool_from_route(route)
        for route in config.get("toolRoutes", [])
    }

    @app.list_tools()
    async def list_tools() -> list[types.Tool]:
        return [
            types.Tool(
                name=tool.exposedName,
                description=tool.description,
                inputSchema=tool.inputSchema or {"type": "object", "properties": {}},
            )
            for tool in tools.values()
            if tool.permission != "disabled"
        ]

    @app.call_tool()
    async def call_tool(name: str, arguments: dict[str, Any] | None) -> list[types.TextContent]:
        tool = tools.get(name)
        if not tool:
            raise ValueError(f"Tool {name!r} is not exposed by this gateway.")
        if tool.permission == "disabled":
            raise PermissionError(f"Tool {name!r} is disabled by policy.")
        server = servers.get(tool.serverId)
        if not server:
            raise ValueError(f"Upstream server {tool.serverId!r} was not found.")
        result = await connector.call_tool(server, tool, arguments or {})
        return [
            types.TextContent(
                type="text",
                text=json.dumps(result, ensure_ascii=False, indent=2),
            )
        ]

    return app


async def run(config_path: str | None) -> None:
    app = build_gateway_app(_load_config(config_path))
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a generated MCP Composer gateway.")
    parser.add_argument("--config", help="Path to a generated gateway.config.json file.")
    args = parser.parse_args()
    asyncio.run(run(args.config))


if __name__ == "__main__":
    main()
