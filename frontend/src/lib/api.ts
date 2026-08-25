import type {
  CatalogSearchResponse,
  GeneratedGatewayResponse,
  McpComposition,
  McpServerDefinition,
  TestConnectionResponse,
  ToolDiscoveryResponse,
  ValidationResult
} from "./types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

async function errorMessage(response: Response): Promise<string> {
  const fallback = `Request failed with ${response.status}.`;
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const text = (await response.text()).trim();
    return text.slice(0, 500) || fallback;
  }

  try {
    const body = (await response.json()) as { detail?: unknown; message?: unknown };
    const detail = body.detail ?? body.message;
    if (typeof detail === "string") return detail.slice(0, 500);
    if (detail) return JSON.stringify(detail).slice(0, 500);
  } catch {
    return fallback;
  }

  return fallback;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "same-origin",
    headers
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return response.json() as Promise<T>;
}

function runtimeServerPayload(server: McpServerDefinition): McpServerDefinition {
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
    tools: server.tools.map((tool) => ({ ...tool, inputSchema: { ...tool.inputSchema } }))
  };
}

export const api = {
  health: () => request<{ status: string; service: string; mode: string; version: string }>("/api/health"),
  catalog: () => request<McpServerDefinition[]>("/api/catalog"),
  searchCatalog: ({ query, cursor, limit = 30 }: { query?: string; cursor?: string | null; limit?: number }) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (cursor) params.set("cursor", cursor);
    params.set("limit", String(limit));
    params.set("include_external", "true");
    return request<CatalogSearchResponse>(`/api/catalog/search?${params.toString()}`);
  },
  validateComposition: (composition: McpComposition) =>
    request<ValidationResult>("/api/validate-composition", {
      method: "POST",
      body: JSON.stringify(composition)
    }),
  generateGateway: (composition: McpComposition) =>
    request<GeneratedGatewayResponse>("/api/generate-gateway", {
      method: "POST",
      body: JSON.stringify(composition)
    }),
  testConnection: (server: McpServerDefinition) =>
    request<TestConnectionResponse>("/api/test-connection", {
      method: "POST",
      body: JSON.stringify(runtimeServerPayload(server))
    }),
  discoverTools: (server: McpServerDefinition) =>
    request<ToolDiscoveryResponse>("/api/discover-tools", {
      method: "POST",
      body: JSON.stringify(runtimeServerPayload(server))
    })
};

export { API_BASE_URL };
