from __future__ import annotations

import sys
from copy import deepcopy
from pathlib import Path

from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)
FIXTURE_SERVER = Path(__file__).parent / "fixtures" / "simple_mcp_server.py"


def _catalog() -> list[dict]:
    response = client.get("/api/catalog")
    assert response.status_code == 200
    return response.json()


def _stdio_fixture_server() -> dict:
    return {
        "id": "fixture-mcp",
        "name": "Fixture MCP",
        "description": "Local stdio MCP test server.",
        "transport": "stdio",
        "source": "manual",
        "command": sys.executable,
        "args": [str(FIXTURE_SERVER)],
        "url": None,
        "env": {},
        "tags": ["test"],
        "status": "ready",
        "tools": [],
    }


def _discover_fixture_tools() -> tuple[dict, list[dict]]:
    server = _stdio_fixture_server()
    response = client.post("/api/discover-tools", json=server)
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ready", payload
    assert payload["tools"]
    server["tools"] = payload["tools"]
    return server, payload["tools"]


def _composition(description: str = "Review repository changes and issue metadata.") -> dict:
    server, tools = _discover_fixture_tools()
    tool = deepcopy(next(item for item in tools if item["originalName"] == "echo"))
    tool["enabled"] = True
    tool["permission"] = "auto"
    return {
        "id": "test-composition",
        "name": "Code Review Gateway",
        "description": description,
        "useCase": "Code Review MCP",
        "systemNotes": "Prefer read-only tools by default.",
        "servers": [server],
        "selectedTools": [tool],
        "createdAt": "2026-05-19T00:00:00+00:00",
        "updatedAt": "2026-05-19T00:00:00+00:00",
    }


def test_catalog_returns_starter_server_templates_without_embedded_tools() -> None:
    catalog = _catalog()
    assert len(catalog) >= 8
    server_ids = {server["id"] for server in catalog}
    assert {
        "github-mcp",
        "filesystem-mcp",
        "postgresql-mcp",
        "slack-mcp",
        "browser-search-mcp",
        "linear-mcp",
        "notion-mcp",
        "docker-mcp",
    }.issubset(server_ids)
    for server in catalog:
        assert "transport" in server
        assert "status" in server
        assert "tools" in server
        assert server["tools"] == []


def test_catalog_search_returns_paginated_starter_templates_without_external_network() -> None:
    response = client.get("/api/catalog/search", params={"limit": 3, "q": "mcp"})
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["servers"]) == 3
    assert payload["nextCursor"]
    assert payload["sources"][0]["id"] == "local"

    next_response = client.get(
        "/api/catalog/search", params={"limit": 3, "q": "mcp", "cursor": payload["nextCursor"]}
    )
    assert next_response.status_code == 200
    next_payload = next_response.json()
    assert next_payload["servers"]
    assert {server["id"] for server in payload["servers"]}.isdisjoint(
        {server["id"] for server in next_payload["servers"]}
    )


def test_discover_tools_uses_real_stdio_mcp_server() -> None:
    _, tools = _discover_fixture_tools()
    names = {tool["originalName"] for tool in tools}
    assert {"echo", "add"}.issubset(names)
    for tool in tools:
        assert "serverId" in tool
        assert "originalName" in tool
        assert "exposedName" in tool
        assert "inputSchema" in tool
        assert "riskLevel" in tool


def test_validate_composition_valid_and_missing_description_warning() -> None:
    valid_response = client.post("/api/validate-composition", json=_composition())
    assert valid_response.status_code == 200
    valid_payload = valid_response.json()
    assert valid_payload["valid"] is True
    assert valid_payload["errors"] == []

    warning_response = client.post("/api/validate-composition", json=_composition(description=""))
    assert warning_response.status_code == 200
    warning_payload = warning_response.json()
    assert warning_payload["valid"] is True
    assert any("description" in warning.lower() for warning in warning_payload["warnings"])


def test_validate_composition_detects_alias_conflicts_destructive_and_error_server() -> None:
    server = _stdio_fixture_server()
    server["status"] = "error"
    read_tool = {
        "id": "fixture-read",
        "serverId": server["id"],
        "originalName": "read_file",
        "exposedName": "fixture.read_file",
        "description": "Read a file.",
        "inputSchema": {"type": "object"},
        "riskLevel": "read",
        "permission": "auto",
        "enabled": True,
    }
    destructive_tool = {
        **read_tool,
        "id": "fixture-delete",
        "originalName": "delete_file",
        "description": "Delete a file.",
        "riskLevel": "destructive",
        "permission": "require_approval",
    }
    composition = {
        "id": "conflict-composition",
        "name": "Filesystem Gateway",
        "description": "Manage local files.",
        "useCase": "DevOps MCP",
        "systemNotes": None,
        "servers": [server],
        "selectedTools": [read_tool, destructive_tool],
        "createdAt": "2026-05-19T00:00:00+00:00",
        "updatedAt": "2026-05-19T00:00:00+00:00",
    }

    response = client.post("/api/validate-composition", json=composition)
    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is False
    assert any("Alias conflicts" in error for error in payload["errors"])
    assert any("Destructive tools" in warning for warning in payload["warnings"])
    assert any("error status" in warning for warning in payload["warnings"])


def test_generate_gateway_returns_export_artifacts() -> None:
    response = client.post("/api/generate-gateway", json=_composition())
    assert response.status_code == 200
    payload = response.json()
    assert "composition_json" in payload
    assert "gateway_config_json" in payload
    assert "mcp_servers_snippet" in payload
    assert "readme_text" in payload
    assert "exposed_tools" in payload
    assert payload["exposed_tools"][0]["name"]
    assert payload["gateway_config_json"]["runtime"]["connector"] == "mcp-python-sdk"
    assert (
        payload["mcp_servers_snippet"]["mcpServers"]["code-review-gateway"]["command"] == "python"
    )
    server_config = payload["mcp_servers_snippet"]["mcpServers"]["code-review-gateway"]
    assert server_config["args"] == ["-m", "app.gateway_server"]
    assert server_config["env"] == {
        "APP_MODE": "local",
        "PYTHONPATH": "<PATH_TO_MCP_COMPOSER>/backend",
        "MCP_COMPOSER_CONFIG": (
            "<PATH_TO_MCP_COMPOSER>/backend/app/generated/code-review-gateway.gateway.config.json"
        ),
    }
    assert (
        'APP_MODE=local python -m app.gateway_server --config "./app/generated/'
        'code-review-gateway.gateway.config.json"' in payload["readme_text"]
    )


def test_generate_gateway_rejects_invalid_composition() -> None:
    invalid = {
        "id": "invalid",
        "name": "Invalid Gateway",
        "description": "Missing servers and selected tools.",
        "useCase": "Test",
        "servers": [],
        "selectedTools": [],
    }
    response = client.post("/api/generate-gateway", json=invalid)
    assert response.status_code == 422
    assert response.json()["detail"]["errors"]


def test_proxy_tool_call_routes_to_real_upstream_mcp_server() -> None:
    composition = _composition()
    response = client.post(
        "/api/proxy-tool-call",
        json={
            "toolName": composition["selectedTools"][0]["exposedName"],
            "input": {"message": "hello from proxy"},
            "composition": composition,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True, payload
    assert "hello from proxy" in str(payload["result"])
