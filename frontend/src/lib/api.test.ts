import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./api";
import type { CatalogServerDefinition } from "./types";

const catalogServer: CatalogServerDefinition = {
  id: "github-mcp",
  name: "GitHub MCP",
  description: "GitHub MCP server.",
  transport: "stdio",
  source: "registry",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-github"],
  url: null,
  env: { GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_PERSONAL_ACCESS_TOKEN}" },
  tags: ["github"],
  status: "needs_auth",
  tools: [],
  catalogSources: ["registry"],
  repositoryUrl: "https://github.com/modelcontextprotocol/servers",
  homepageUrl: null,
  packageId: "@modelcontextprotocol/server-github",
  remoteUrl: null,
  installHint: "npx -y @modelcontextprotocol/server-github",
  externalUrl: "https://github.com/modelcontextprotocol/servers",
  verified: true,
  popularity: 100
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("upstream MCP requests", () => {
  it.each(["testConnection", "discoverTools"] as const)("strips catalog metadata for %s", async (method) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "needs_auth", message: "Missing token.", tools: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await api[method](catalogServer);

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body).toEqual({
      id: catalogServer.id,
      name: catalogServer.name,
      description: catalogServer.description,
      transport: catalogServer.transport,
      source: catalogServer.source,
      command: catalogServer.command,
      args: catalogServer.args,
      url: catalogServer.url,
      env: catalogServer.env,
      tags: catalogServer.tags,
      status: catalogServer.status,
      tools: catalogServer.tools
    });
  });
});
