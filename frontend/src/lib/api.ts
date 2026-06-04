import type {
  CatalogSearchResponse,
  GeneratedGatewayResponse,
  McpComposition,
  McpServerDefinition,
  TestConnectionResponse,
  ToolDiscoveryResponse,
  ValidationResult
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string; service: string }>("/api/health"),
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
      body: JSON.stringify(server)
    }),
  discoverTools: (server: McpServerDefinition) =>
    request<ToolDiscoveryResponse>("/api/discover-tools", {
      method: "POST",
      body: JSON.stringify(server)
    })
};

export { API_BASE_URL };
