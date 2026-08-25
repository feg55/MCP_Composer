from __future__ import annotations

import asyncio
import base64
import json
from pathlib import Path

import app.api.routes_composition as composition_routes
import app.gateway_server as gateway_server
import httpx
import pytest
from app.core.connectors.mcp_connector import (
    MAX_DISCOVERED_TOOLS,
    MAX_DISCOVERED_TOOLS_BYTES,
    MAX_INPUT_SCHEMA_BYTES,
    McpSdkConnector,
    UpstreamToolsLimitError,
    _http_transport_kwargs,
    _resolved_env,
)
from app.core.gateway import (
    InvalidCompositionError,
    build_readme_text,
    generate_gateway_response,
)
from app.core.risk import default_permission_for_risk, detect_tool_risk
from app.core.settings import Settings, _bool
from app.core.types import McpComposition, McpServerDefinition, McpToolDefinition
from app.main import RequestBodyLimitMiddleware, create_app
from fastapi.testclient import TestClient


def _settings(
    tmp_path: Path,
    *,
    mode: str = "local",
    app_version: str = "0.1.0",
    frontend_dist_dir: Path | None = None,
    max_request_bytes: int = 1_000_000,
) -> Settings:
    hosted = mode == "hosted"
    return Settings(
        app_version=app_version,
        app_mode="hosted" if hosted else "local",
        allowed_origins=("https://composer.example",),
        allowed_hosts=("testserver", "composer.example"),
        remote_hosts=("mcp.example",),
        data_dir=tmp_path / "generated",
        docs_enabled=not hosted,
        require_origin=hosted,
        frontend_dist_dir=frontend_dist_dir,
        max_request_bytes=max_request_bytes,
    )


def _server(**updates: object) -> McpServerDefinition:
    payload: dict[str, object] = {
        "id": "server",
        "name": "Server",
        "description": "Test server.",
        "transport": "stdio",
        "source": "manual",
        "command": "python",
        "args": [],
        "env": {},
        "status": "ready",
        "tools": [],
    }
    payload.update(updates)
    return McpServerDefinition(**payload)


def _tool(permission: str = "auto") -> McpToolDefinition:
    return McpToolDefinition(
        id="server-read",
        serverId="server",
        originalName="read",
        exposedName="server.read",
        description="Read data.",
        inputSchema={"type": "object"},
        riskLevel="read",
        permission=permission,
        enabled=True,
    )


def _invalid_composition() -> McpComposition:
    return McpComposition(
        id="invalid",
        name="Invalid",
        description="No upstream server or tool.",
        useCase="Test",
        servers=[],
        selectedTools=[],
    )


def _valid_composition() -> McpComposition:
    return McpComposition(
        id="valid",
        name="Valid Gateway",
        description="A valid test gateway.",
        useCase="Test",
        servers=[_server()],
        selectedTools=[_tool()],
    )


def test_api_rejects_non_json_and_untrusted_origins(tmp_path: Path) -> None:
    client = TestClient(create_app(_settings(tmp_path)))
    non_json = client.post(
        "/api/validate-composition",
        content="{}",
        headers={"Content-Type": "text/plain"},
    )
    assert non_json.status_code == 415

    untrusted = client.post(
        "/api/validate-composition",
        json=_invalid_composition().model_dump(mode="json"),
        headers={"Origin": "https://attacker.example"},
    )
    assert untrusted.status_code == 403


def test_hosted_settings_reject_wildcard_trust(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="exact origins"):
        Settings(
            app_mode="hosted",
            allowed_origins=("*",),
            allowed_hosts=("*",),
            data_dir=tmp_path,
        )
    with pytest.raises(ValueError, match="exact origins"):
        Settings(
            app_mode="hosted",
            allowed_origins=("https://composer.example",),
            allowed_hosts=("*.example",),
            data_dir=tmp_path,
            require_origin=True,
        )
    with pytest.raises(ValueError, match="require HTTPS"):
        Settings(
            app_mode="hosted",
            allowed_origins=("http://composer.example",),
            allowed_hosts=("composer.example",),
            data_dir=tmp_path,
            require_origin=True,
        )


def test_hosted_settings_reject_disabled_origin_check_and_invalid_boolean(
    tmp_path: Path,
) -> None:
    with pytest.raises(ValueError, match="Origin validation"):
        Settings(
            app_mode="hosted",
            allowed_origins=("https://composer.example",),
            allowed_hosts=("composer.example",),
            data_dir=tmp_path,
            require_origin=False,
        )
    with pytest.raises(ValueError, match="Invalid boolean"):
        _bool("treu", True)


def test_hosted_mode_requires_an_allowed_origin(tmp_path: Path) -> None:
    client = TestClient(create_app(_settings(tmp_path, mode="hosted")))
    missing = client.post(
        "/api/validate-composition",
        json=_invalid_composition().model_dump(mode="json"),
    )
    assert missing.status_code == 403

    allowed = client.post(
        "/api/validate-composition",
        json=_invalid_composition().model_dump(mode="json"),
        headers={"Origin": "https://composer.example"},
    )
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "https://composer.example"


def test_hosted_mode_disables_client_defined_proxy_calls(tmp_path: Path) -> None:
    client = TestClient(create_app(_settings(tmp_path, mode="hosted")))
    response = client.post(
        "/api/proxy-tool-call",
        json={"toolName": "server.read", "input": {}},
        headers={"Origin": "https://composer.example"},
    )
    assert response.status_code == 403
    assert "server-side" in response.json()["detail"]


def test_hosted_generation_does_not_persist_user_artifacts(tmp_path: Path) -> None:
    client = TestClient(create_app(_settings(tmp_path, mode="hosted")))
    response = client.post(
        "/api/generate-gateway",
        json=_valid_composition().model_dump(mode="json"),
        headers={"Origin": "https://composer.example"},
    )
    assert response.status_code == 200
    assert not (tmp_path / "generated").exists()


def test_api_rejects_oversized_and_unknown_fields(tmp_path: Path) -> None:
    client = TestClient(create_app(_settings(tmp_path)))
    oversized = client.post(
        "/api/validate-composition",
        content="{}",
        headers={
            "Content-Type": "application/json",
            "Content-Length": "1000001",
        },
    )
    assert oversized.status_code == 413

    payload = _invalid_composition().model_dump(mode="json")
    payload["unexpected"] = True
    unknown = client.post("/api/validate-composition", json=payload)
    assert unknown.status_code == 422


def test_api_rejects_streamed_body_without_content_length(tmp_path: Path) -> None:
    downstream_called = False
    sent_messages: list[dict[str, object]] = []
    request_messages = iter(
        [
            {"type": "http.request", "body": b'{"padding":"', "more_body": True},
            {"type": "http.request", "body": b"x" * 64, "more_body": True},
            {"type": "http.request", "body": b'"}', "more_body": False},
        ]
    )

    async def downstream(scope: object, receive: object, send: object) -> None:
        nonlocal downstream_called
        downstream_called = True

    async def receive() -> dict[str, object]:
        return next(request_messages)

    async def send(message: dict[str, object]) -> None:
        sent_messages.append(message)

    middleware = RequestBodyLimitMiddleware(downstream, max_request_bytes=32)
    asyncio.run(
        middleware(
            {
                "type": "http",
                "method": "POST",
                "path": "/api/validate-composition",
            },
            receive,
            send,
        )
    )

    assert downstream_called is False
    assert any(message.get("status") == 413 for message in sent_messages)


def test_security_headers_and_trusted_hosts(tmp_path: Path) -> None:
    client = TestClient(create_app(_settings(tmp_path, mode="hosted", app_version="9.8.7")))
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["version"] == "9.8.7"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "default-src 'self'" in response.headers["content-security-policy"]
    assert response.headers["strict-transport-security"].startswith("max-age=")

    rejected = client.get("/api/health", headers={"Host": "attacker.example"})
    assert rejected.status_code == 400


def test_frontend_dist_serves_assets_and_safe_spa_fallback(tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    assets = dist / "assets"
    assets.mkdir(parents=True)
    (dist / "index.html").write_text("<main>Composer</main>", encoding="utf-8")
    (assets / "app.js").write_text("console.log('ok')", encoding="utf-8")
    client = TestClient(create_app(_settings(tmp_path, frontend_dist_dir=dist)))

    root = client.get("/")
    assert root.status_code == 200
    assert "Composer" in root.text
    assert root.headers["cache-control"] == "no-cache"

    root_head = client.head("/")
    assert root_head.status_code == 200
    assert root_head.content == b""

    asset = client.get("/assets/app.js")
    assert asset.status_code == 200
    assert "console.log" in asset.text
    assert "immutable" in asset.headers["cache-control"]

    asset_head = client.head("/assets/app.js")
    assert asset_head.status_code == 200
    assert asset_head.content == b""
    assert "immutable" in asset_head.headers["cache-control"]

    fallback = client.get("/builder/step/2", headers={"Accept": "text/html"})
    assert fallback.status_code == 200
    assert "Composer" in fallback.text
    assert fallback.headers["cache-control"] == "no-cache"

    api_missing = client.get("/api/not-a-route", headers={"Accept": "text/html"})
    assert api_missing.status_code == 404
    assert "Composer" not in api_missing.text


def test_local_interactive_docs_are_not_blocked_by_application_csp(tmp_path: Path) -> None:
    client = TestClient(create_app(_settings(tmp_path)))
    response = client.get("/docs")
    assert response.status_code == 200
    assert "Content-Security-Policy" not in response.headers


def test_hosted_connector_blocks_stdio_and_private_networks(tmp_path: Path) -> None:
    connector = McpSdkConnector(settings=_settings(tmp_path, mode="hosted"))
    stdio_result = asyncio.run(connector.test_connection(_server()))
    assert stdio_result.status == "error"
    assert "disabled" in stdio_result.message

    private_http = _server(
        transport="http",
        command=None,
        url="https://127.0.0.1/mcp",
    )
    http_result = asyncio.run(connector.test_connection(private_http))
    assert http_result.status == "error"
    assert "allowlisted" in http_result.message

    allowlisted_private = _server(
        transport="http",
        command=None,
        url="https://mcp.example/mcp",
    )
    connector.settings = Settings(
        app_mode="hosted",
        allowed_origins=("https://composer.example",),
        allowed_hosts=("testserver",),
        remote_hosts=("127.0.0.1",),
        data_dir=tmp_path / "generated",
        docs_enabled=False,
        require_origin=True,
    )
    private_result = asyncio.run(
        connector.test_connection(
            allowlisted_private.model_copy(update={"url": "https://127.0.0.1/mcp"})
        )
    )
    assert private_result.status == "error"
    assert "Private" in private_result.message


def test_hosted_http_transport_disables_redirects(tmp_path: Path) -> None:
    kwargs = _http_transport_kwargs(_settings(tmp_path, mode="hosted"))
    factory = kwargs["httpx_client_factory"]
    client = factory(timeout=httpx.Timeout(5))
    assert client.follow_redirects is False
    assert client.trust_env is False
    asyncio.run(client.aclose())


def test_unknown_tool_risk_requires_approval() -> None:
    risk = detect_tool_risk("execute_shell", "Run arbitrary instructions.")
    assert risk == "external"
    assert default_permission_for_risk(risk) == "require_approval"


def test_generated_gateway_enforces_required_app_mode(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        gateway_server,
        "get_settings",
        lambda: _settings(tmp_path, mode="hosted"),
    )
    with pytest.raises(RuntimeError, match="requires APP_MODE=local"):
        gateway_server.build_gateway_app(
            {
                "gateway": {"name": "Test"},
                "runtime": {"requiredAppMode": "local"},
                "upstreamServers": [],
                "toolRoutes": [],
            }
        )


def test_malformed_catalog_cursor_is_ignored(tmp_path: Path) -> None:
    client = TestClient(create_app(_settings(tmp_path)))
    malformed_payload = base64.urlsafe_b64encode(
        json.dumps({"sourceDone": 1, "seen": None}).encode("utf-8")
    ).decode("ascii")
    response = client.get("/api/catalog/search", params={"cursor": malformed_payload})
    assert response.status_code == 200
    assert response.json()["servers"]


def test_child_process_env_is_minimal(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MCP_COMPOSER_INTERNAL_SECRET", "do-not-forward")
    monkeypatch.setenv("NPM_CONFIG_CACHE", "/tmp/npm-cache")
    monkeypatch.setenv("PATH", "safe-path")
    env = _resolved_env(_server())
    assert env["PATH"] == "safe-path"
    assert env["NPM_CONFIG_CACHE"] == "/tmp/npm-cache"
    assert "MCP_COMPOSER_INTERNAL_SECRET" not in env


def test_approval_is_enforced_before_tool_execution(tmp_path: Path) -> None:
    connector = McpSdkConnector(settings=_settings(tmp_path))
    with pytest.raises(PermissionError, match="requires approval"):
        asyncio.run(connector.call_tool(_server(), _tool("require_approval"), {}))


def test_invalid_composition_does_not_write_artifacts(tmp_path: Path) -> None:
    output = tmp_path / "generated"
    with pytest.raises(InvalidCompositionError):
        generate_gateway_response(_invalid_composition(), output)
    assert not output.exists()


def test_generated_markdown_escapes_untrusted_content(tmp_path: Path) -> None:
    composition = McpComposition(
        id="markdown",
        name="<img src=x onerror=alert(1)>",
        description="[click](javascript:alert(1))",
        useCase="Test",
        servers=[_server()],
        selectedTools=[_tool()],
    )
    readme = build_readme_text(
        composition,
        [
            {
                "name": "`unsafe`",
                "serverName": "<server>",
                "originalName": "read",
                "riskLevel": "read",
                "permission": "auto",
            }
        ],
    )
    assert "<img" not in readme
    assert "javascript:alert(1)" not in readme
    assert "&#96;unsafe&#96;" in readme


def test_discovery_fetches_upstream_tools_once(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0

    async def fake_list_tools(
        connector: McpSdkConnector,
        server: McpServerDefinition,
    ) -> list[McpToolDefinition]:
        nonlocal calls
        del connector, server
        calls += 1
        return [_tool()]

    monkeypatch.setattr(McpSdkConnector, "list_tools", fake_list_tools)
    client = TestClient(create_app(_settings(tmp_path)))
    response = client.post(
        "/api/discover-tools",
        json=_server().model_dump(mode="json"),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert len(response.json()["tools"]) == 1
    assert calls == 1


@pytest.mark.parametrize(
    "path",
    ["/api/test-connection", "/api/discover-tools"],
)
def test_upstream_routes_reject_requests_when_process_capacity_is_full(
    path: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        composition_routes,
        "_upstream_request_slots",
        asyncio.Semaphore(0),
    )
    client = TestClient(create_app(_settings(tmp_path)))
    response = client.post(path, json=_server().model_dump(mode="json"))

    assert response.status_code == 503
    assert response.headers["retry-after"] == "1"


def test_upstream_tool_count_is_bounded(tmp_path: Path) -> None:
    connector = McpSdkConnector(settings=_settings(tmp_path))
    sdk_tool = {
        "name": "read",
        "description": "Read data.",
        "inputSchema": {"type": "object"},
    }

    with pytest.raises(UpstreamToolsLimitError, match=str(MAX_DISCOVERED_TOOLS)):
        connector._to_tool_definitions(
            _server(),
            [sdk_tool] * (MAX_DISCOVERED_TOOLS + 1),
        )


def test_upstream_input_schema_size_is_bounded(tmp_path: Path) -> None:
    connector = McpSdkConnector(settings=_settings(tmp_path))
    sdk_tool = {
        "name": "read",
        "description": "Read data.",
        "inputSchema": {
            "type": "object",
            "description": "x" * MAX_INPUT_SCHEMA_BYTES,
        },
    }

    with pytest.raises(UpstreamToolsLimitError, match=str(MAX_INPUT_SCHEMA_BYTES)):
        connector._to_tool_definitions(_server(), [sdk_tool])


def test_upstream_tool_catalog_serialized_size_is_bounded(tmp_path: Path) -> None:
    connector = McpSdkConnector(settings=_settings(tmp_path))
    sdk_tool = {
        "name": "read",
        "description": "x" * 20_000,
        "inputSchema": {"type": "object"},
    }
    tool_count = (MAX_DISCOVERED_TOOLS_BYTES // len(sdk_tool["description"])) + 1

    with pytest.raises(UpstreamToolsLimitError, match=str(MAX_DISCOVERED_TOOLS_BYTES)):
        connector._to_tool_definitions(_server(), [sdk_tool] * tool_count)
