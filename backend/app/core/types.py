from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

McpTransport = Literal["stdio", "http"]
RiskLevel = Literal["read", "write", "external", "destructive"]
PermissionMode = Literal["auto", "require_approval", "disabled"]
ServerSource = Literal["registry", "github", "manual", "official", "pulsemcp", "smithery", "glama"]
ServerStatus = Literal["ready", "needs_auth", "error", "disabled"]
LogSeverity = Literal["info", "warning", "error", "success"]
Identifier = Annotated[str, StringConstraints(min_length=1, max_length=200)]
ShortText = Annotated[str, StringConstraints(max_length=500)]
CursorText = Annotated[str, StringConstraints(max_length=32_768)]
LongText = Annotated[str, StringConstraints(max_length=20_000)]
DocumentText = Annotated[str, StringConstraints(max_length=1_000_000)]
UrlText = Annotated[str, StringConstraints(max_length=2_048)]
EnvKey = Annotated[str, StringConstraints(min_length=1, max_length=128)]
EnvValue = Annotated[str, StringConstraints(max_length=8_192)]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class McpToolDefinition(CamelModel):
    id: Identifier
    serverId: Identifier
    originalName: Identifier
    exposedName: Identifier
    description: LongText
    inputSchema: dict[str, Any] = Field(default_factory=dict, max_length=500)
    riskLevel: RiskLevel
    permission: PermissionMode
    enabled: bool = False


class McpServerDefinition(CamelModel):
    id: Identifier
    name: Identifier
    description: LongText
    transport: McpTransport
    source: ServerSource
    command: ShortText | None = None
    args: list[ShortText] = Field(default_factory=list, max_length=100)
    url: UrlText | None = None
    env: dict[EnvKey, EnvValue] = Field(default_factory=dict, max_length=100)
    headers: dict[EnvKey, EnvValue] = Field(default_factory=dict, max_length=100)
    tags: list[ShortText] = Field(default_factory=list, max_length=100)
    status: ServerStatus = "ready"
    tools: list[McpToolDefinition] = Field(default_factory=list, max_length=1_000)


class CatalogServerDefinition(McpServerDefinition):
    catalogSources: list[ShortText] = Field(default_factory=list, max_length=20)
    repositoryUrl: UrlText | None = None
    homepageUrl: UrlText | None = None
    packageId: ShortText | None = None
    remoteUrl: UrlText | None = None
    installHint: LongText | None = None
    externalUrl: UrlText | None = None
    verified: bool = False
    popularity: int | None = None


class CatalogSourceStatus(CamelModel):
    id: Identifier
    label: ShortText
    enabled: bool
    ok: bool
    message: LongText | None = None


class CatalogSearchResponse(CamelModel):
    servers: list[CatalogServerDefinition] = Field(default_factory=list, max_length=100)
    nextCursor: CursorText | None = None
    sources: list[CatalogSourceStatus] = Field(default_factory=list, max_length=20)


class McpComposition(CamelModel):
    id: Identifier
    name: Identifier
    description: LongText
    useCase: ShortText
    systemNotes: LongText | None = None
    servers: list[McpServerDefinition] = Field(default_factory=list, max_length=100)
    selectedTools: list[McpToolDefinition] = Field(default_factory=list, max_length=2_000)
    createdAt: ShortText = Field(default_factory=utc_now_iso)
    updatedAt: ShortText = Field(default_factory=utc_now_iso)


class ValidationResult(CamelModel):
    valid: bool
    warnings: list[LongText] = Field(default_factory=list, max_length=100)
    errors: list[LongText] = Field(default_factory=list, max_length=100)


class GeneratedGatewayResponse(CamelModel):
    composition_json: dict[str, Any] = Field(max_length=50)
    gateway_config_json: dict[str, Any] = Field(max_length=50)
    mcp_servers_snippet: dict[str, Any] = Field(max_length=50)
    readme_text: DocumentText
    exposed_tools: list[dict[str, Any]] = Field(max_length=2_000)


class ProxyToolCallRequest(CamelModel):
    toolName: Identifier
    input: dict[str, Any] = Field(default_factory=dict, max_length=500)
    composition: McpComposition | None = None
    gatewayConfig: dict[str, Any] | None = Field(default=None, max_length=100)


class ProxyToolCallResponse(CamelModel):
    ok: bool
    toolName: Identifier
    result: dict[str, Any] | None = Field(default=None, max_length=500)
    error: LongText | None = None


class TestConnectionResponse(CamelModel):
    status: Literal["ready", "needs_auth", "error"]
    message: LongText


class ToolDiscoveryResponse(CamelModel):
    status: Literal["ready", "needs_auth", "error"]
    message: LongText
    tools: list[McpToolDefinition] = Field(default_factory=list, max_length=1_000)


class AuditLogEntry(CamelModel):
    id: Identifier
    timestamp: ShortText
    type: ShortText
    message: LongText
    severity: LogSeverity
