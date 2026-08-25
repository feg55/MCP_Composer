import type {
  AuditLogEntry,
  LogSeverity,
  ManualServerInput,
  McpComposition,
  McpServerDefinition,
  McpToolDefinition,
  PermissionMode,
  RiskLevel,
  TaskProfile
} from "./types";

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/mcp/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "server";
}

export function namespaceToolName(server: Pick<McpServerDefinition, "name" | "id">, originalName: string): string {
  return `${slugify(server.name || server.id)}.${originalName}`;
}

export function defaultPermissionForRisk(riskLevel: RiskLevel): PermissionMode {
  return riskLevel === "read" ? "auto" : "require_approval";
}

export function cloneServer(server: McpServerDefinition): McpServerDefinition {
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    transport: server.transport,
    source: server.source,
    command: server.command,
    args: [...server.args],
    url: server.url,
    env: { ...server.env },
    tags: [...server.tags],
    status: server.status,
    tools: server.tools.map((tool) => ({
      ...tool,
      inputSchema: { ...tool.inputSchema },
      enabled: false,
      permission: tool.permission || defaultPermissionForRisk(tool.riskLevel)
    }))
  };
}

export function parseArgsText(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseEnvText(text: string): Record<string, string> {
  return text.split("\n").reduce<Record<string, string>>((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return acc;
    const [key, ...rest] = trimmed.split("=");
    if (key.trim()) acc[key.trim()] = rest.join("=").trim();
    return acc;
  }, {});
}

export function createManualServer(input: ManualServerInput): McpServerDefinition {
  const id = uid("manual");

  return {
    id,
    name: input.name.trim() || "Manual MCP Server",
    description: "Manually configured MCP server. Use Discover tools to inspect live upstream capabilities.",
    transport: input.transport,
    source: "manual",
    command: input.transport === "stdio" ? input.command.trim() || null : null,
    args: input.transport === "stdio" ? parseArgsText(input.argsText) : [],
    url: input.transport === "http" ? input.url.trim() || null : null,
    env: parseEnvText(input.envText),
    tags: ["manual", input.transport],
    status: "ready",
    tools: []
  };
}

export function selectedToolsFromServers(servers: McpServerDefinition[]): McpToolDefinition[] {
  return servers.flatMap((server) => (server.status === "disabled" ? [] : server.tools.filter((tool) => tool.enabled)));
}

export function aliasConflicts(tools: McpToolDefinition[]): string[] {
  const counts = tools.reduce<Record<string, number>>((acc, tool) => {
    const alias = tool.exposedName.trim();
    if (alias) acc[alias] = (acc[alias] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .filter(([, count]) => count > 1)
    .map(([alias]) => alias);
}

export function riskCounts(tools: McpToolDefinition[]): Record<RiskLevel, number> {
  return tools.reduce<Record<RiskLevel, number>>(
    (acc, tool) => {
      acc[tool.riskLevel] += 1;
      return acc;
    },
    { read: 0, write: 0, external: 0, destructive: 0 }
  );
}

export function buildComposition(
  taskProfile: TaskProfile,
  servers: McpServerDefinition[],
  selectedTools: McpToolDefinition[]
): McpComposition {
  const timestamp = new Date().toISOString();
  return {
    id: "composition-local",
    name: taskProfile.name || "Custom MCP Gateway",
    description: taskProfile.description,
    useCase: taskProfile.useCase,
    systemNotes: taskProfile.systemNotes || null,
    servers,
    selectedTools,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function auditEntry(type: string, message: string, severity: LogSeverity = "info"): AuditLogEntry {
  return {
    id: uid("log"),
    timestamp: new Date().toISOString(),
    type,
    message,
    severity
  };
}

export async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

export function downloadText(filename: string, value: string, mime = "application/json"): void {
  const blob = new Blob([value], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
