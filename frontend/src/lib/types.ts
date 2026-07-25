export type McpTransport = "stdio" | "http";
export type RiskLevel = "read" | "write" | "external" | "destructive";
export type PermissionMode = "auto" | "require_approval" | "disabled";
export type ServerSource = "registry" | "github" | "manual" | "official" | "pulsemcp" | "smithery" | "glama";
export type ServerStatus = "ready" | "needs_auth" | "error" | "disabled";
export type LogSeverity = "info" | "warning" | "error" | "success";

export interface McpToolDefinition {
  id: string;
  serverId: string;
  originalName: string;
  exposedName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  riskLevel: RiskLevel;
  permission: PermissionMode;
  enabled: boolean;
}

export interface McpServerDefinition {
  id: string;
  name: string;
  description: string;
  transport: McpTransport;
  source: ServerSource;
  command: string | null;
  args: string[];
  url: string | null;
  env: Record<string, string>;
  tags: string[];
  status: ServerStatus;
  tools: McpToolDefinition[];
}

export interface CatalogServerDefinition extends McpServerDefinition {
  catalogSources?: string[];
  repositoryUrl?: string | null;
  homepageUrl?: string | null;
  packageId?: string | null;
  remoteUrl?: string | null;
  installHint?: string | null;
  externalUrl?: string | null;
  verified?: boolean;
  popularity?: number | null;
}

export interface CatalogSourceStatus {
  id: string;
  label: string;
  enabled: boolean;
  ok: boolean;
  message: string | null;
}

export interface CatalogSearchResponse {
  servers: CatalogServerDefinition[];
  nextCursor: string | null;
  sources: CatalogSourceStatus[];
}

export interface McpComposition {
  id: string;
  name: string;
  description: string;
  useCase: string;
  systemNotes: string | null;
  servers: McpServerDefinition[];
  selectedTools: McpToolDefinition[];
  createdAt: string;
  updatedAt: string;
}

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export interface GeneratedGatewayResponse {
  composition_json: Record<string, unknown>;
  gateway_config_json: Record<string, unknown>;
  mcp_servers_snippet: Record<string, unknown>;
  readme_text: string;
  exposed_tools: Array<Record<string, unknown>>;
}

export interface TestConnectionResponse {
  status: "ready" | "needs_auth" | "error";
  message: string;
}

export interface ToolDiscoveryResponse {
  status: "ready" | "needs_auth" | "error";
  message: string;
  tools: McpToolDefinition[];
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  type: string;
  message: string;
  severity: LogSeverity;
}

export interface TaskProfile {
  name: string;
  description: string;
  useCase: string;
  systemNotes: string;
}

export interface AppPersistedState {
  taskProfile: TaskProfile;
  serverPool: McpServerDefinition[];
  auditLog: AuditLogEntry[];
}

export interface ManualServerInput {
  name: string;
  transport: McpTransport;
  command: string;
  argsText: string;
  url: string;
  envText: string;
}
