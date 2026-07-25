from __future__ import annotations

import html
import re
from pathlib import Path
from typing import Any

from app.core.composition import selected_enabled_tools, validate_composition
from app.core.connectors.base import McpConnector
from app.core.storage import save_json
from app.core.types import (
    GeneratedGatewayResponse,
    McpComposition,
    McpServerDefinition,
    McpToolDefinition,
    ProxyToolCallRequest,
    ProxyToolCallResponse,
)


class InvalidCompositionError(ValueError):
    def __init__(self, errors: list[str]) -> None:
        self.errors = errors
        super().__init__("Gateway composition is invalid.")


MARKDOWN_SPECIAL = re.compile(r"([\\`*_{}\[\]()#+.!|>~-])")
PORTABLE_PROJECT_ROOT = "<PATH_TO_MCP_COMPOSER>"


def _markdown_text(value: str, *, single_line: bool = False) -> str:
    normalized = " ".join(value.splitlines()) if single_line else value
    escaped_html = html.escape(normalized, quote=True)
    return MARKDOWN_SPECIAL.sub(r"\\\1", escaped_html)


def _markdown_code(value: object) -> str:
    escaped = html.escape(str(value), quote=False).replace("`", "&#96;")
    return f"`{escaped}`"


def slugify(value: str) -> str:
    cleaned = "".join(char.lower() if char.isalnum() else "-" for char in value)
    cleaned = "-".join(part for part in cleaned.split("-") if part)
    return cleaned or "mcp-composer-gateway"


def list_exposed_tools(composition: McpComposition) -> list[dict[str, Any]]:
    server_lookup = {server.id: server for server in composition.servers}
    exposed: list[dict[str, Any]] = []
    for tool in selected_enabled_tools(composition.selectedTools):
        server = server_lookup.get(tool.serverId)
        exposed.append(
            {
                "name": tool.exposedName,
                "serverId": tool.serverId,
                "serverName": server.name if server else "Unknown server",
                "originalName": tool.originalName,
                "description": tool.description,
                "riskLevel": tool.riskLevel,
                "permission": tool.permission,
                "inputSchema": tool.inputSchema,
            }
        )
    return exposed


def generate_gateway_config(composition: McpComposition) -> dict[str, Any]:
    validation = validate_composition(composition)
    servers = [
        {
            "id": server.id,
            "name": server.name,
            "transport": server.transport,
            "source": server.source,
            "command": server.command,
            "args": server.args,
            "url": server.url,
            "env": server.env,
            "status": server.status,
        }
        for server in composition.servers
    ]
    tools = list_exposed_tools(composition)
    policies = [
        {
            "toolName": tool["name"],
            "riskLevel": tool["riskLevel"],
            "permission": tool["permission"],
            "requiresApproval": tool["permission"] == "require_approval",
        }
        for tool in tools
    ]
    return {
        "gateway": {
            "id": composition.id,
            "name": composition.name,
            "slug": slugify(composition.name),
            "description": composition.description,
            "useCase": composition.useCase,
            "systemNotes": composition.systemNotes,
            "createdAt": composition.createdAt,
            "updatedAt": composition.updatedAt,
        },
        "upstreamServers": servers,
        "toolRoutes": tools,
        "policies": policies,
        "validation": validation.model_dump(mode="json"),
        "runtime": {
            "requiredAppMode": "local",
            "connector": "mcp-python-sdk",
            "gatewayCommand": "python -m app.gateway_server",
            "proxyEndpoint": "/api/proxy-tool-call",
        },
    }


def _portable_config_path(slug: str) -> str:
    return f"{PORTABLE_PROJECT_ROOT}/backend/app/generated/{slug}.gateway.config.json"


def create_mcp_server_config_snippet(composition: McpComposition) -> dict[str, Any]:
    gateway_name = slugify(composition.name)
    config_path = _portable_config_path(gateway_name)
    return {
        "mcpServers": {
            gateway_name: {
                "command": "python",
                "args": ["-m", "app.gateway_server"],
                "env": {
                    "APP_MODE": "local",
                    "PYTHONPATH": f"{PORTABLE_PROJECT_ROOT}/backend",
                    "MCP_COMPOSER_CONFIG": config_path,
                },
            }
        }
    }


def build_readme_text(
    composition: McpComposition,
    exposed_tools: list[dict[str, Any]],
) -> str:
    config_path = f"./app/generated/{slugify(composition.name)}.gateway.config.json"
    lines = [
        f"# {_markdown_text(composition.name, single_line=True)}",
        "",
        _markdown_text(
            composition.description or "Generated MCP Composer gateway.",
        ),
        "",
        "## Local run",
        "",
        "PowerShell:",
        "",
        "```powershell",
        "cd backend",
        '$env:APP_MODE = "local"',
        f'python -m app.gateway_server --config "{config_path}"',
        "```",
        "",
        "Bash:",
        "",
        "```bash",
        "cd backend",
        f'APP_MODE=local python -m app.gateway_server --config "{config_path}"',
        "```",
        "",
        "## Exposed tools",
        "",
    ]
    if exposed_tools:
        for tool in exposed_tools:
            route = f"{tool['serverName']}.{tool['originalName']}"
            lines.append(
                f"- {_markdown_code(tool['name'])} -> {_markdown_code(route)} "
                f"({_markdown_text(str(tool['riskLevel']))}, "
                f"{_markdown_text(str(tool['permission']))})"
            )
    else:
        lines.append("- No tools selected.")
    lines.extend(
        [
            "",
            "## Integration seam",
            "",
            "The gateway routes calls through `McpSdkConnector`, which implements the connector interface in `app/core/connectors/base.py` with the official MCP Python SDK.",
            "",
        ]
    )
    return "\n".join(lines)


def generate_gateway_response(
    composition: McpComposition,
    data_dir: Path | None = None,
    *,
    persist: bool = True,
) -> GeneratedGatewayResponse:
    validation = validate_composition(composition)
    if not validation.valid:
        raise InvalidCompositionError(validation.errors)

    exposed_tools = list_exposed_tools(composition)
    gateway_config = generate_gateway_config(composition)
    slug = slugify(composition.name)
    composition_json = composition.model_dump(mode="json")
    if persist:
        save_json(f"{slug}.composition.json", composition_json, data_dir)
        save_json(f"{slug}.gateway.config.json", gateway_config, data_dir)
    return GeneratedGatewayResponse(
        composition_json=composition_json,
        gateway_config_json=gateway_config,
        mcp_servers_snippet=create_mcp_server_config_snippet(composition),
        readme_text=build_readme_text(composition, exposed_tools),
        exposed_tools=exposed_tools,
    )


def _find_server(servers: list[McpServerDefinition], server_id: str) -> McpServerDefinition | None:
    return next((server for server in servers if server.id == server_id), None)


def _find_tool(composition: McpComposition, tool_name: str) -> McpToolDefinition | None:
    return next(
        (
            tool
            for tool in composition.selectedTools
            if tool.exposedName == tool_name or tool.originalName == tool_name
        ),
        None,
    )


async def proxy_tool_call(
    request: ProxyToolCallRequest,
    connector: McpConnector,
) -> ProxyToolCallResponse:
    if not request.composition:
        return ProxyToolCallResponse(
            ok=False,
            toolName=request.toolName,
            error="A composition is required for proxy calls.",
        )

    tool = _find_tool(request.composition, request.toolName)
    if not tool:
        return ProxyToolCallResponse(
            ok=False, toolName=request.toolName, error="Tool was not found in composition."
        )
    if tool.permission == "disabled":
        return ProxyToolCallResponse(
            ok=False, toolName=request.toolName, error="Tool is disabled by policy."
        )
    if tool.permission == "require_approval":
        return ProxyToolCallResponse(
            ok=False,
            toolName=request.toolName,
            error="Tool execution requires approval, but no approval flow is configured.",
        )

    server = _find_server(request.composition.servers, tool.serverId)
    if not server:
        return ProxyToolCallResponse(
            ok=False, toolName=request.toolName, error="Upstream server was not found."
        )

    try:
        result = await connector.call_tool(server, tool, request.input)
    except Exception as exc:  # noqa: BLE001 - API should return upstream proxy failures as data.
        return ProxyToolCallResponse(ok=False, toolName=request.toolName, error=str(exc))
    return ProxyToolCallResponse(ok=True, toolName=request.toolName, result=result)
