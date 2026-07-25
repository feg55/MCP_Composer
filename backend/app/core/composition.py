from __future__ import annotations

from collections import Counter
from typing import Iterable

from app.core.types import McpComposition, McpServerDefinition, McpToolDefinition, ValidationResult


def parse_args_text(text: str | None) -> list[str]:
    if not text:
        return []
    return [line.strip() for line in text.splitlines() if line.strip()]


def parse_env_text(text: str | None) -> dict[str, str]:
    if not text:
        return {}
    env: dict[str, str] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        if key:
            env[key] = value.strip()
    return env


def normalize_server_config(server: McpServerDefinition | dict) -> McpServerDefinition:
    model = server if isinstance(server, McpServerDefinition) else McpServerDefinition(**server)
    args = [arg.strip() for arg in model.args if arg.strip()]
    env = {key.strip(): value.strip() for key, value in model.env.items() if key.strip()}
    normalized = model.model_copy(update={"args": args, "env": env})
    return normalized


def selected_enabled_tools(tools: Iterable[McpToolDefinition]) -> list[McpToolDefinition]:
    return [tool for tool in tools if tool.enabled and tool.permission != "disabled"]


def validate_composition(composition: McpComposition) -> ValidationResult:
    warnings: list[str] = []
    errors: list[str] = []

    if not composition.name.strip():
        errors.append("Gateway name is required.")
    if not composition.description.strip():
        warnings.append("Task description is missing.")
    if not composition.servers:
        errors.append("Add at least one MCP server to the pool.")

    selected_tools = selected_enabled_tools(composition.selectedTools)
    if not selected_tools:
        errors.append("Select at least one enabled tool.")

    aliases = [tool.exposedName.strip() for tool in selected_tools]
    duplicate_aliases = sorted(
        alias for alias, count in Counter(aliases).items() if alias and count > 1
    )
    if duplicate_aliases:
        errors.append(f"Alias conflicts detected: {', '.join(duplicate_aliases)}.")
    if any(not alias for alias in aliases):
        errors.append("Every selected tool needs an exposed alias.")

    destructive = [tool.exposedName for tool in selected_tools if tool.riskLevel == "destructive"]
    if destructive:
        warnings.append(f"Destructive tools enabled: {', '.join(destructive)}.")

    approval_suggested = [
        tool.exposedName
        for tool in selected_tools
        if tool.riskLevel in {"write", "external"} and tool.permission == "auto"
    ]
    if approval_suggested:
        warnings.append(
            f"Write/external tools set to auto approval: {', '.join(approval_suggested)}."
        )

    server_by_id = {server.id: server for server in composition.servers}
    errored_servers = [server.name for server in composition.servers if server.status == "error"]
    if errored_servers:
        warnings.append(f"Servers with error status: {', '.join(errored_servers)}.")

    disabled_servers = {
        server.id: server.name for server in composition.servers if server.status == "disabled"
    }
    selected_from_disabled = [
        tool.exposedName for tool in selected_tools if tool.serverId in disabled_servers
    ]
    if selected_from_disabled:
        errors.append(
            f"Selected tools belong to disabled servers: {', '.join(selected_from_disabled)}."
        )

    missing_server_refs = [
        tool.exposedName for tool in selected_tools if tool.serverId not in server_by_id
    ]
    if missing_server_refs:
        errors.append(
            f"Selected tools reference missing servers: {', '.join(missing_server_refs)}."
        )

    return ValidationResult(valid=not errors, warnings=warnings, errors=errors)
