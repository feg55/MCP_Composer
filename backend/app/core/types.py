from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


McpTransport = Literal["stdio", "http"]
RiskLevel = Literal["read", "write", "external", "destructive"]
PermissionMode = Literal["auto", "require_approval", "disabled"]
ServerSource = Literal["registry", "github", "manual", "official", "pulsemcp", "smithery", "glama"]
ServerStatus = Literal["ready", "needs_auth", "error", "disabled"]
LogSeverity = Literal["info", "warning", "error", "success"]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class McpToolDefinition(CamelModel):
    id: str
    serverId: str
    originalName: str
    exposedName: str
    description: str
    inputSchema: dict[str, Any] = Field(default_factory=dict)
    riskLevel: RiskLevel
    permission: PermissionMode
    enabled: bool = False


class McpServerDefinition(CamelModel):
    id: str
    name: str
    description: str
    transport: McpTransport
    source: ServerSource
    command: str | None = None
    args: list[str] = Field(default_factory=list)
    url: str | None = None
    env: dict[str, str] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    status: ServerStatus = "ready"
    tools: list[McpToolDefinition] = Field(default_factory=list)


class CatalogServerDefinition(McpServerDefinition):
    catalogSources: list[str] = Field(default_factory=list)
    repositoryUrl: str | None = None
    homepageUrl: str | None = None
    packageId: str | None = None
    remoteUrl: str | None = None
    installHint: str | None = None
    externalUrl: str | None = None
    verified: bool = False
    popularity: int | None = None


class CatalogSourceStatus(CamelModel):
    id: str
    label: str
    enabled: bool
    ok: bool
    message: str | None = None


class CatalogSearchResponse(CamelModel):
    servers: list[CatalogServerDefinition] = Field(default_factory=list)
    nextCursor: str | None = None
    sources: list[CatalogSourceStatus] = Field(default_factory=list)


class McpComposition(CamelModel):
    id: str
    name: str
    description: str
    useCase: str
    systemNotes: str | None = None
    servers: list[McpServerDefinition] = Field(default_factory=list)
    selectedTools: list[McpToolDefinition] = Field(default_factory=list)
    createdAt: str = Field(default_factory=utc_now_iso)
    updatedAt: str = Field(default_factory=utc_now_iso)


class ValidationResult(CamelModel):
    valid: bool
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class GeneratedGatewayResponse(CamelModel):
    composition_json: dict[str, Any]
    gateway_config_json: dict[str, Any]
    mcp_servers_snippet: dict[str, Any]
    readme_text: str
    exposed_tools: list[dict[str, Any]]


class ProxyToolCallRequest(CamelModel):
    toolName: str
    input: dict[str, Any] = Field(default_factory=dict)
    composition: McpComposition | None = None
    gatewayConfig: dict[str, Any] | None = None


class ProxyToolCallResponse(CamelModel):
    ok: bool
    toolName: str
    result: dict[str, Any] | None = None
    error: str | None = None


class TestConnectionResponse(CamelModel):
    status: Literal["ready", "needs_auth", "error"]
    message: str


class ToolDiscoveryResponse(CamelModel):
    status: Literal["ready", "needs_auth", "error"]
    message: str
    tools: list[McpToolDefinition] = Field(default_factory=list)


class AuditLogEntry(CamelModel):
    id: str
    timestamp: str
    type: str
    message: str
    severity: LogSeverity
