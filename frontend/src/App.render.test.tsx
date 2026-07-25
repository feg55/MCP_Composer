import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { pushAudit, resetActivityStoreForTests } from "./lib/activityStore";
import { compositionActions, resetCompositionStoreForTests } from "./lib/compositionStore";
import { setRenderObserver, type RenderBoundary } from "./lib/renderAudit";
import { resetTaskProfileStoreForTests } from "./lib/taskProfileStore";
import type { CatalogServerDefinition, GeneratedGatewayResponse } from "./lib/types";

const apiMocks = vi.hoisted(() => ({
  searchCatalog: vi.fn(),
  testConnection: vi.fn(),
  discoverTools: vi.fn(),
  validateComposition: vi.fn(),
  generateGateway: vi.fn()
}));

vi.mock("./lib/api", () => ({
  API_BASE_URL: "",
  api: apiMocks
}));

const catalogServer: CatalogServerDefinition = {
  id: "server-1",
  name: "Demo MCP Server",
  description: "Server used by render isolation tests.",
  transport: "stdio",
  source: "official",
  command: "demo-mcp",
  args: [],
  url: null,
  env: {},
  tags: ["demo"],
  status: "ready",
  verified: true,
  tools: [
    {
      id: "tool-1",
      serverId: "server-1",
      originalName: "demo_read",
      exposedName: "demo_read",
      description: "Read demo data.",
      inputSchema: { type: "object" },
      riskLevel: "read",
      permission: "auto",
      enabled: false
    },
    {
      id: "tool-2",
      serverId: "server-1",
      originalName: "demo_write",
      exposedName: "demo_write",
      description: "Write demo data.",
      inputSchema: { type: "object" },
      riskLevel: "write",
      permission: "require_approval",
      enabled: false
    }
  ]
};

const secondCatalogServer: CatalogServerDefinition = {
  ...catalogServer,
  id: "server-2",
  name: "Second MCP Server",
  command: "second-mcp",
  tools: [
    {
      ...catalogServer.tools[0],
      id: "tool-3",
      serverId: "server-2",
      originalName: "second_read",
      exposedName: "second_read"
    }
  ]
};

const generatedGateway: GeneratedGatewayResponse = {
  composition_json: { name: "Demo" },
  gateway_config_json: { gateway: { slug: "demo" } },
  mcp_servers_snippet: {},
  readme_text: "# Demo",
  exposed_tools: []
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const applicationRootBoundaries: RenderBoundary[] = [
  "App",
  "AppShell",
  "AppHeader",
  "AppFooter",
  "AppLayout",
  "ComposerWorkspace"
];
const staticShellBoundaries: RenderBoundary[] = [...applicationRootBoundaries, "ActiveStep"];
const staticSummaryBoundaries: RenderBoundary[] = [
  "GatewaySummary",
  "GatewayIdentity",
  "GatewayName",
  "GatewayDescription",
  "Metrics",
  "Metric:servers",
  "Metric:tools",
  "RiskBreakdown",
  "RiskRow:read",
  "RiskRow:write",
  "RiskRow:external",
  "RiskRow:destructive",
  "Warnings",
  "GenerateButton"
];

describe("application render isolation", () => {
  const renderCounts = new Map<RenderBoundary, number>();

  beforeEach(() => {
    localStorage.clear();
    resetTaskProfileStoreForTests();
    resetActivityStoreForTests();
    resetCompositionStoreForTests();
    vi.clearAllMocks();

    apiMocks.searchCatalog.mockResolvedValue({
      servers: [catalogServer],
      nextCursor: null,
      sources: []
    });
    apiMocks.testConnection.mockResolvedValue({ status: "ready", message: "Connected." });
    apiMocks.discoverTools.mockResolvedValue({
      status: "ready",
      message: "Discovered.",
      tools: catalogServer.tools
    });
    apiMocks.validateComposition.mockResolvedValue({ valid: true, warnings: [], errors: [] });
    apiMocks.generateGateway.mockResolvedValue(generatedGateway);

    setRenderObserver((boundary) => {
      renderCounts.set(boundary, (renderCounts.get(boundary) ?? 0) + 1);
    });
  });

  afterEach(() => {
    setRenderObserver(null);
    cleanup();
    resetTaskProfileStoreForTests();
    resetActivityStoreForTests();
    resetCompositionStoreForTests();
    renderCounts.clear();
  });

  function resetRenderCounts(): void {
    renderCounts.clear();
  }

  function expectRenders(boundary: RenderBoundary, count: number): void {
    expect(renderCounts.get(boundary) ?? 0, boundary).toBe(count);
  }

  function expectNoRenders(boundaries: RenderBoundary[]): void {
    boundaries.forEach((boundary) => expectRenders(boundary, 0));
  }

  function countRenderedPrefix(prefix: string): number {
    return Array.from(renderCounts.entries()).reduce(
      (total, [boundary, count]) => (boundary.startsWith(prefix) ? total + count : total),
      0
    );
  }

  async function openServersStep(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(apiMocks.searchCatalog).toHaveBeenCalledTimes(1));
    await screen.findByText("Demo MCP Server");
  }

  async function addServer(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText("0/2 tools selected");
  }

  it("deduplicates the catalog mount effect under the browser StrictMode tree", async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <App />
      </StrictMode>
    );

    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Demo MCP Server");
    expect(apiMocks.searchCatalog).toHaveBeenCalledTimes(1);
  });

  it("updates only the edited Task Profile subscribers", async () => {
    const user = userEvent.setup();
    render(<App />);

    resetRenderCounts();
    await user.type(screen.getByLabelText("System instruction / notes"), "n");
    expectRenders("SystemNotesField", 1);
    expectNoRenders([
      ...staticShellBoundaries,
      "ComposerWorkspace",
      "AppLayout",
      "TaskProfileEditor",
      "NameField",
      "UseCaseField",
      "DescriptionField",
      ...staticSummaryBoundaries
    ]);

    resetRenderCounts();
    await user.type(screen.getByLabelText("Custom MCP name"), "x");
    expectRenders("NameField", 1);
    expectRenders("GatewayName", 1);
    expectNoRenders([
      ...staticShellBoundaries,
      "ComposerWorkspace",
      "AppLayout",
      "TaskProfileEditor",
      "UseCaseField",
      "DescriptionField",
      "SystemNotesField",
      "GatewaySummary",
      "GatewayIdentity",
      "GatewayDescription",
      "Metrics",
      "RiskBreakdown",
      "Warnings",
      "GenerateButton"
    ]);

    resetRenderCounts();
    await user.type(screen.getByLabelText("Task description"), "a");
    expectRenders("DescriptionField", 1);
    expectRenders("GatewayDescription", 1);
    expectRenders("Warnings", 1);
    expectNoRenders([
      ...staticShellBoundaries,
      "ComposerWorkspace",
      "AppLayout",
      "TaskProfileEditor",
      "NameField",
      "UseCaseField",
      "SystemNotesField",
      "GatewaySummary",
      "GatewayIdentity",
      "GatewayName",
      "Metrics",
      "RiskBreakdown",
      "GenerateButton"
    ]);

    resetRenderCounts();
    await user.type(screen.getByLabelText("Task description"), "b");
    expectRenders("DescriptionField", 1);
    expectRenders("GatewayDescription", 1);
    expectRenders("Warnings", 0);
    expectNoRenders([...staticShellBoundaries, "ComposerWorkspace", "AppLayout", "GatewaySummary"]);
  });

  it("keeps catalog typing, remote loading, tabs, and manual input below the workspace root", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openServersStep(user);

    resetRenderCounts();
    await user.type(screen.getByLabelText("Search servers"), "d");
    expectRenders("CatalogSearchInput", 1);
    expectNoRenders([
      ...staticShellBoundaries,
      "ComposerWorkspace",
      "AppLayout",
      "ServerSetupTabs",
      "ServerDiscovery",
      "ServerPool",
      "BuilderStepper",
      "StepNavigation",
      ...staticSummaryBoundaries
    ]);

    resetRenderCounts();
    await waitFor(() => expect(apiMocks.searchCatalog).toHaveBeenCalledTimes(2));
    expect((apiMocks.searchCatalog.mock.calls[1]?.[0] as { query?: string }).query).toBe("d");
    expect((renderCounts.get("ServerDiscovery") ?? 0) > 0).toBe(true);
    expectNoRenders([
      ...staticShellBoundaries,
      "ComposerWorkspace",
      "AppLayout",
      "ServerSetupTabs",
      "ServerPool",
      "BuilderStepper",
      "StepNavigation",
      ...staticSummaryBoundaries
    ]);

    resetRenderCounts();
    await user.selectOptions(screen.getByLabelText("Filter by tag"), "demo");
    expectRenders("ServerDiscovery", 1);
    expectRenders("CatalogSearchInput", 0);
    expectRenders("CatalogCard:server-1", 0);
    expectNoRenders([
      ...staticShellBoundaries,
      "ComposerWorkspace",
      "AppLayout",
      "ServerSetupTabs",
      "ServerPool",
      "BuilderStepper",
      "StepNavigation",
      ...staticSummaryBoundaries
    ]);

    resetRenderCounts();
    await user.click(screen.getByRole("tab", { name: /Manual server/ }));
    expectRenders("ServerSetupTabs", 1);
    expectRenders("ManualServerForm", 1);
    expectNoRenders([
      ...staticShellBoundaries,
      "ComposerWorkspace",
      "AppLayout",
      "ServerDiscovery",
      "ServerPool",
      ...staticSummaryBoundaries
    ]);

    resetRenderCounts();
    await user.type(screen.getByLabelText("Server name"), "x");
    expectRenders("ManualServerForm", 1);
    expectNoRenders([
      ...staticShellBoundaries,
      "ComposerWorkspace",
      "AppLayout",
      "ServerSetupTabs",
      "ServerDiscovery",
      "ServerPool",
      ...staticSummaryBoundaries
    ]);

    resetRenderCounts();
    await user.click(screen.getByRole("tab", { name: /Manual server/ }));
    expectNoRenders([
      ...staticShellBoundaries,
      "ComposerWorkspace",
      "AppLayout",
      "ServerSetupTabs",
      "ServerDiscovery",
      "ManualServerForm",
      "ServerPool",
      ...staticSummaryBoundaries
    ]);
  });

  it("isolates server status and tool card actions from shell and summary", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openServersStep(user);
    await addServer(user);

    resetRenderCounts();
    await user.click(screen.getByRole("button", { name: "Disable" }));
    expectRenders("ComposerWorkspace", 0);
    expectRenders("AppLayout", 0);
    expectRenders("ServerPool", 0);
    expectRenders("ServerPoolCard:server-1", 1);
    expectRenders("ToastHost", 1);
    expectNoRenders([
      ...staticShellBoundaries,
      "ServerSetupTabs",
      "ServerDiscovery",
      "BuilderStepper",
      "StepNavigation",
      ...staticSummaryBoundaries
    ]);

    resetRenderCounts();
    await user.click(screen.getByRole("button", { name: "Enable" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Tool Picker");

    resetRenderCounts();
    await user.type(screen.getAllByLabelText("Exposed alias")[0], "x");
    expectRenders("ComposerWorkspace", 0);
    expectRenders("AppLayout", 0);
    expectRenders("ToolPicker", 0);
    expectRenders("ToolServerGroup:server-1", 1);
    expectRenders("ToolCard:tool-1", 1);
    expectRenders("ToolCard:tool-2", 0);
    expectNoRenders([...staticShellBoundaries, "BuilderStepper", "StepNavigation", ...staticSummaryBoundaries]);

    resetRenderCounts();
    await user.selectOptions(screen.getAllByLabelText("Permission mode")[0], "disabled");
    expectRenders("ComposerWorkspace", 0);
    expectRenders("AppLayout", 0);
    expectRenders("ToolPicker", 0);
    expectRenders("ToolServerGroup:server-1", 1);
    expectRenders("ToolCard:tool-1", 1);
    expectRenders("ToolCard:tool-2", 0);
    expectRenders("ToastHost", 1);
    expectNoRenders([...staticShellBoundaries, "BuilderStepper", "StepNavigation", ...staticSummaryBoundaries]);

    resetRenderCounts();
    await user.click(screen.getAllByRole("button", { name: "Input schema preview" })[0]);
    expectRenders("ToolCard:tool-1", 1);
    expectNoRenders([
      ...staticShellBoundaries,
      "ComposerWorkspace",
      "AppLayout",
      "ToolPicker",
      "ToolServerGroup:server-1",
      "ToolCard:tool-2",
      ...staticSummaryBoundaries
    ]);
  });

  it("keeps unrelated server groups and tool cards out of an alias conflict update", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openServersStep(user);
    await addServer(user);
    act(() => compositionActions.addServer(secondCatalogServer));
    await screen.findByText("Second MCP Server");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Tool Picker");

    const aliases = screen.getAllByLabelText("Exposed alias");
    await user.type(aliases[0], "x");
    await user.clear(aliases[2]);
    await user.type(aliases[2], "demo_readx");
    await user.click(screen.getByLabelText("Enable demo_read"));

    resetRenderCounts();
    await user.click(screen.getByLabelText("Enable second_read"));

    expectRenders("ToolPicker", 0);
    expectRenders("ToolServerGroup:server-1", 1);
    expectRenders("ToolServerGroup:server-2", 1);
    expectRenders("ToolCard:tool-1", 1);
    expectRenders("ToolCard:tool-2", 0);
    expectRenders("ToolCard:tool-3", 1);
    expectRenders("AliasWarning", 1);
    expectNoRenders(staticShellBoundaries);
  });

  it("isolates connection status and list removal from the application roots", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openServersStep(user);
    await addServer(user);

    resetRenderCounts();
    await user.click(screen.getByRole("button", { name: "Test" }));
    await waitFor(() => expect(apiMocks.testConnection).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Test" }) as HTMLButtonElement).disabled).toBe(false)
    );

    expect((renderCounts.get("ServerPoolCard:server-1") ?? 0) > 0).toBe(true);
    expectRenders("ServerPool", 0);
    expectRenders("ToastHost", 1);
    expectNoRenders([...staticShellBoundaries, ...staticSummaryBoundaries]);

    resetRenderCounts();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByText("0/2 tools selected")).toBeNull());

    expectRenders("ServerPool", 1);
    expectRenders("CatalogCard:server-1", 1);
    expectRenders("Metric:servers", 1);
    expectRenders("ToastHost", 1);
    expectNoRenders(staticShellBoundaries);
  });

  it("updates toast activity without rendering the application tree", () => {
    render(<App />);
    resetRenderCounts();

    act(() => pushAudit("test", "Isolated activity.", "success"));

    expectRenders("ToastHost", 1);
    expectNoRenders([
      ...staticShellBoundaries,
      "ComposerWorkspace",
      "AppLayout",
      "BuilderStepper",
      "StepNavigation",
      ...staticSummaryBoundaries
    ]);
  });

  it("rejects a stale generation response and resets output back to the tool step", async () => {
    const user = userEvent.setup();
    const pendingGateway = deferred<GeneratedGatewayResponse>();
    apiMocks.generateGateway.mockReturnValueOnce(pendingGateway.promise);

    render(<App />);
    await openServersStep(user);
    await addServer(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByLabelText("Enable demo_read"));
    await user.click(screen.getByRole("button", { name: "Generate and review" }));
    await waitFor(() => expect(apiMocks.generateGateway).toHaveBeenCalledTimes(1));

    act(() => resetActivityStoreForTests());
    resetRenderCounts();
    await user.type(screen.getAllByLabelText("Exposed alias")[0], "x");
    expectRenders("ToolServerGroup:server-1", 1);
    expectRenders("ToolCard:tool-1", 1);
    expectRenders("ToolPicker", 0);
    expectNoRenders(applicationRootBoundaries);

    await act(async () => {
      pendingGateway.resolve(generatedGateway);
      await pendingGateway.promise;
    });
    expect(screen.queryByText("Composition JSON")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Generate and review" }));
    await screen.findByText("Composition JSON");

    resetRenderCounts();
    await user.click(screen.getByRole("button", { name: "Reset" }));
    await screen.findByText("Tool Picker");

    expectRenders("App", 0);
    expectRenders("AppLayout", 0);
    expectRenders("ComposerWorkspace", 0);
    expectRenders("ActiveStep", 1);
    expectRenders("OutputSize", 1);
  });

  it("keeps copy activity out of generated output and the workspace root", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openServersStep(user);
    await addServer(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByLabelText("Enable demo_read"));
    await user.click(screen.getByRole("button", { name: "Generate and review" }));
    await screen.findByText("Composition JSON");

    resetRenderCounts();
    await user.click(screen.getByRole("button", { name: "Copy JSON" }));
    expect(await screen.findAllByText("Copied composition JSON.")).toHaveLength(2);

    expectRenders("ToastHost", 1);
    expectRenders("AuditLog", 1);
    expect(countRenderedPrefix("AuditLogRow:")).toBe(1);
    expectNoRenders([
      ...staticShellBoundaries,
      "ComposerWorkspace",
      "AppLayout",
      "BuilderStepper",
      "StepNavigation",
      "GatewayOutput",
      "Roadmap",
      ...staticSummaryBoundaries
    ]);
    expect(countRenderedPrefix("OutputBlock:")).toBe(0);
  });
});
