import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, FileText, ServerCrash, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api, API_BASE_URL } from "./lib/api";
import { loadState, saveState } from "./lib/storage";
import type {
  AuditLogEntry,
  CatalogServerDefinition,
  CatalogSourceStatus,
  GeneratedGatewayResponse,
  LogSeverity,
  McpServerDefinition,
  McpToolDefinition,
  PermissionMode,
  TaskProfile
} from "./lib/types";
import {
  aliasConflicts,
  auditEntry,
  buildComposition,
  buildWarnings,
  cloneServer,
  copyText,
  downloadText,
  formatJson,
  selectedToolsFromServers
} from "./lib/utils";
import { AppShell } from "./components/AppShell";
import { AuditLog } from "./components/AuditLog";
import { BuilderStepper, type BuilderStepItem } from "./components/BuilderStepper";
import { Button } from "./components/Button";
import { GatewayOutput } from "./components/GatewayOutput";
import { GatewaySummary } from "./components/GatewaySummary";
import { ManualServerForm } from "./components/ManualServerForm";
import { Panel } from "./components/Panel";
import { Roadmap } from "./components/Roadmap";
import { ServerDiscovery } from "./components/ServerDiscovery";
import { ServerPool } from "./components/ServerPool";
import { ServerSetupTabs, type ServerSetupTab } from "./components/ServerSetupTabs";
import { ToolPicker } from "./components/ToolPicker";

const defaultTaskProfile: TaskProfile = {
  name: "Custom MCP Gateway",
  description: "",
  useCase: "Code Review MCP",
  systemNotes: ""
};

const fieldClass =
  "w-full rounded-md border border-[#343d34] bg-[#111510] px-3 py-2 text-[0.8125rem] text-[#e7ece7] placeholder:text-[#6f7a70]";

interface ToastState {
  message: string;
  severity: LogSeverity;
}

type BuilderStep = "profile" | "servers" | "tools" | "output";

const builderSteps: Array<BuilderStepItem<BuilderStep>> = [
  { id: "profile", label: "Task Profile", detail: "Name and use case" },
  { id: "servers", label: "Add Servers", detail: "Catalog or manual" },
  { id: "tools", label: "Pick Tools", detail: "Aliases and permissions" },
  { id: "output", label: "Gateway Output", detail: "Generate and export" }
];

function App() {
  const persisted = useMemo(() => loadState(), []);
  const [catalog, setCatalog] = useState<CatalogServerDefinition[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogLoadingMore, setCatalogLoadingMore] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogCursor, setCatalogCursor] = useState<string | null>(null);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogSources, setCatalogSources] = useState<CatalogSourceStatus[]>([]);
  const [taskProfile, setTaskProfile] = useState<TaskProfile>(persisted?.taskProfile ?? defaultTaskProfile);
  const [serverPool, setServerPool] = useState<McpServerDefinition[]>(persisted?.serverPool ?? []);
  const [generated, setGenerated] = useState<GeneratedGatewayResponse | null>(persisted?.generated ?? null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>(persisted?.auditLog ?? []);
  const [testingServerId, setTestingServerId] = useState<string | null>(null);
  const [discoveringServerId, setDiscoveringServerId] = useState<string | null>(null);
  const [focusServerId, setFocusServerId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [activeStep, setActiveStep] = useState<BuilderStep>("profile");
  const [serverSetupTab, setServerSetupTab] = useState<ServerSetupTab>("catalog");

  const selectedTools = useMemo(() => selectedToolsFromServers(serverPool), [serverPool]);
  const warnings = useMemo(() => buildWarnings(taskProfile, serverPool, selectedTools), [taskProfile, serverPool, selectedTools]);
  const activeStepIndex = builderSteps.findIndex((step) => step.id === activeStep);
  const steps = useMemo<Array<BuilderStepItem<BuilderStep>>>(
    () => [
      { id: "profile", label: "Task Profile", detail: "Name and use case" },
      { id: "servers", label: "Add Servers", detail: "Catalog or manual", count: serverPool.length },
      { id: "tools", label: "Pick Tools", detail: "Aliases and permissions", count: selectedTools.length },
      { id: "output", label: "Gateway Output", detail: "Generate and export" }
    ],
    [selectedTools.length, serverPool.length]
  );

  const pushAudit = useCallback((type: string, message: string, severity: LogSeverity = "info") => {
    const entry = auditEntry(type, message, severity);
    setAuditLog((current) => [entry, ...current].slice(0, 100));
    setToast({ message, severity });
  }, []);

  const mergeCatalogServers = useCallback((current: CatalogServerDefinition[], next: CatalogServerDefinition[]) => {
    const byId = new Map(current.map((server) => [server.id, server]));
    next.forEach((server) => byId.set(server.id, server));
    return Array.from(byId.values());
  }, []);

  const fetchCatalog = useCallback(async (query: string) => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const data = await api.searchCatalog({ query, limit: 30 });
      setCatalog(data.servers);
      setCatalogCursor(data.nextCursor);
      setCatalogSources(data.sources);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load catalog.";
      setCatalogError(`Catalog request failed from ${API_BASE_URL}: ${message}`);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchCatalog(catalogQuery);
    }, 260);
    return () => window.clearTimeout(timeout);
  }, [catalogQuery, fetchCatalog]);

  const loadMoreCatalog = useCallback(async () => {
    if (!catalogCursor || catalogLoading || catalogLoadingMore) return;
    setCatalogLoadingMore(true);
    setCatalogError(null);
    try {
      const data = await api.searchCatalog({ query: catalogQuery, cursor: catalogCursor, limit: 30 });
      setCatalog((current) => mergeCatalogServers(current, data.servers));
      setCatalogCursor(data.nextCursor);
      setCatalogSources(data.sources);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load catalog.";
      setCatalogError(`Catalog request failed from ${API_BASE_URL}: ${message}`);
    } finally {
      setCatalogLoadingMore(false);
    }
  }, [catalogCursor, catalogLoading, catalogLoadingMore, catalogQuery, mergeCatalogServers]);

  useEffect(() => {
    saveState({
      taskProfile,
      serverPool,
      selectedTools,
      generated,
      auditLog
    });
  }, [auditLog, generated, selectedTools, serverPool, taskProfile]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function addServer(server: McpServerDefinition) {
    if (serverPool.some((item) => item.id === server.id)) {
      pushAudit("server_added", `${server.name} is already in the pool.`, "warning");
      return;
    }
    const cloned = cloneServer(server);
    setServerPool((current) => [...current, cloned]);
    pushAudit("server_added", `${cloned.name} added to the server pool.`, "success");
  }

  function removeServer(serverId: string) {
    const server = serverPool.find((item) => item.id === serverId);
    setServerPool((current) => current.filter((item) => item.id !== serverId));
    if (server) pushAudit("server_removed", `${server.name} removed from the pool.`, "warning");
  }

  function toggleServerDisabled(serverId: string) {
    setServerPool((current) =>
      current.map((server) => {
        if (server.id !== serverId) return server;
        const nextStatus = server.status === "disabled" ? "ready" : "disabled";
        pushAudit("server_status", `${server.name} ${nextStatus === "disabled" ? "disabled" : "enabled"}.`, "info");
        return { ...server, status: nextStatus };
      })
    );
  }

  function mergeDiscoveredTools(existing: McpToolDefinition[], discovered: McpToolDefinition[]): McpToolDefinition[] {
    const existingByName = new Map(existing.map((tool) => [tool.originalName, tool]));
    return discovered.map((tool) => {
      const current = existingByName.get(tool.originalName);
      if (!current) return tool;
      return {
        ...tool,
        enabled: current.enabled,
        exposedName: current.exposedName,
        permission: current.permission
      };
    });
  }

  async function inspectServer(serverId: string) {
    const server = serverPool.find((item) => item.id === serverId);
    if (!server) return;
    setDiscoveringServerId(serverId);
    try {
      const result = await api.discoverTools(server);
      setServerPool((current) =>
        current.map((item) =>
          item.id === serverId
            ? {
                ...item,
                status: result.status,
                tools: result.tools.length ? mergeDiscoveredTools(item.tools, result.tools) : item.tools
              }
            : item
        )
      );
      pushAudit(
        "tools_discovered",
        `${server.name}: ${result.message}`,
        result.status === "ready" ? "success" : result.status === "needs_auth" ? "warning" : "error"
      );
      if (result.status === "ready" && result.tools.length) {
        setFocusServerId(serverId);
        setActiveStep("tools");
        window.setTimeout(() => document.getElementById("tool-picker")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool discovery failed.";
      setServerPool((current) => current.map((item) => (item.id === serverId ? { ...item, status: "error" } : item)));
      pushAudit("tools_discovered", `${server.name}: ${message}`, "error");
    } finally {
      setDiscoveringServerId(null);
    }
  }

  async function testConnection(server: McpServerDefinition) {
    setTestingServerId(server.id);
    try {
      const result = await api.testConnection(server);
      setServerPool((current) =>
        current.map((item) => (item.id === server.id ? { ...item, status: result.status } : item))
      );
      pushAudit(
        "connection_tested",
        `${server.name}: ${result.message}`,
        result.status === "ready" ? "success" : result.status === "needs_auth" ? "warning" : "error"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection test failed.";
      setServerPool((current) => current.map((item) => (item.id === server.id ? { ...item, status: "error" } : item)));
      pushAudit("connection_tested", `${server.name}: ${message}`, "error");
    } finally {
      setTestingServerId(null);
    }
  }

  function toggleTool(serverId: string, toolId: string, enabled: boolean) {
    setServerPool((current) =>
      current.map((server) =>
        server.id === serverId
          ? {
              ...server,
              tools: server.tools.map((tool) => (tool.id === toolId ? { ...tool, enabled } : tool))
            }
          : server
      )
    );
    const tool = serverPool.flatMap((server) => server.tools).find((item) => item.id === toolId);
    if (tool) pushAudit(enabled ? "tool_enabled" : "tool_disabled", `${tool.exposedName} ${enabled ? "enabled" : "disabled"}.`, "info");
  }

  function changeAlias(serverId: string, toolId: string, alias: string) {
    setServerPool((current) =>
      current.map((server) =>
        server.id === serverId
          ? {
              ...server,
              tools: server.tools.map((tool) => (tool.id === toolId ? { ...tool, exposedName: alias } : tool))
            }
          : server
      )
    );
    const tool = serverPool.flatMap((server) => server.tools).find((item) => item.id === toolId);
    if (tool) pushAudit("alias_changed", `${tool.originalName} alias changed to ${alias || "(empty)"}.`, "info");
  }

  function changePermission(serverId: string, toolId: string, permission: PermissionMode) {
    setServerPool((current) =>
      current.map((server) =>
        server.id === serverId
          ? {
              ...server,
              tools: server.tools.map((tool) => (tool.id === toolId ? { ...tool, permission } : tool))
            }
          : server
      )
    );
    const tool = serverPool.flatMap((server) => server.tools).find((item) => item.id === toolId);
    if (tool) pushAudit("permission_changed", `${tool.exposedName} permission set to ${permission}.`, "info");
  }

  async function generateGateway(): Promise<boolean> {
    const composition = buildComposition(taskProfile, serverPool, selectedTools);
    setIsGenerating(true);
    try {
      const validation = await api.validateComposition(composition);
      if (!validation.valid) {
        pushAudit("gateway_generated", `Generation blocked: ${validation.errors.join(" ")}`, "error");
        return false;
      }
      const response = await api.generateGateway(composition);
      setGenerated(response);
      pushAudit("gateway_generated", `Generated ${response.exposed_tools.length} exposed tools for ${composition.name}.`, "success");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gateway generation failed.";
      pushAudit("gateway_generated", message, "error");
      return false;
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGenerate() {
    const generatedOk = await generateGateway();
    if (generatedOk) setActiveStep("output");
  }

  async function handleCopy(label: string, value: string) {
    try {
      await copyText(value);
      pushAudit("config_copied", `Copied ${label}.`, "success");
    } catch {
      pushAudit("config_copied", `Unable to copy ${label}.`, "error");
    }
  }

  function handleDownload(filename: string, value: string, mime?: string) {
    downloadText(filename, value, mime);
    pushAudit("config_downloaded", `Downloaded ${filename}.`, "success");
  }

  function resetOutput() {
    setGenerated(null);
    pushAudit("gateway_reset", "Generated gateway output cleared.", "info");
  }

  function canEnterStep(step: BuilderStep): boolean {
    if (step === "tools") return serverPool.some((server) => server.tools.length > 0);
    if (step === "output") return generated !== null;
    return true;
  }

  function goNext() {
    if (activeStep === "tools") {
      void handleGenerate();
      return;
    }
    const next = builderSteps[activeStepIndex + 1];
    if (next && canEnterStep(next.id)) setActiveStep(next.id);
  }

  function goBack() {
    const previous = builderSteps[activeStepIndex - 1];
    if (previous) setActiveStep(previous.id);
  }

  const nextStep = builderSteps[activeStepIndex + 1];
  const nextDisabled =
    activeStep === "tools"
      ? selectedTools.length === 0 || aliasConflicts(selectedTools).length > 0 || isGenerating
      : !nextStep || !canEnterStep(nextStep.id);

  const navigation = (
    <StepNavigation
      activeStep={activeStep}
      stepNumber={activeStepIndex + 1}
      totalSteps={builderSteps.length}
      nextDisabled={nextDisabled}
      isGenerating={isGenerating}
      onBack={goBack}
      onNext={goNext}
    />
  );

  return (
    <AppShell
      sidebar={
        <GatewaySummary
          taskProfile={taskProfile}
          servers={serverPool}
          selectedTools={selectedTools}
          warnings={warnings}
          isGenerating={isGenerating}
          onGenerate={() => void handleGenerate()}
        />
      }
    >
      {toast && (
        <div
          className={`rounded-md border px-4 py-3 text-[0.8125rem] ${
            toast.severity === "error"
              ? "border-[#7b3030] bg-[#361717] text-[#ffb3b3]"
              : toast.severity === "warning"
                ? "border-[#8c6823] bg-[#342711] text-[#ffd48a]"
                : "border-[#2f6f45] bg-[#18331f] text-[#9ee7b1]"
          }`}
        >
          {toast.message}
        </div>
      )}

      <BuilderStepper steps={steps} activeStep={activeStep} onStepChange={setActiveStep} canEnterStep={canEnterStep} />
      {activeStep === "servers" && navigation}

      {activeStep === "profile" && (
        <Panel title="Task Profile" subtitle="Define the custom MCP target and operating notes.">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[0.8125rem] font-semibold text-[#e7ece7]">Custom MCP name</span>
              <input
                className={fieldClass}
                value={taskProfile.name}
                onChange={(event) => setTaskProfile((current) => ({ ...current, name: event.target.value }))}
                placeholder="Code Review Gateway"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[0.8125rem] font-semibold text-[#e7ece7]">Target use case</span>
              <select
                className={fieldClass}
                value={taskProfile.useCase}
                onChange={(event) => setTaskProfile((current) => ({ ...current, useCase: event.target.value }))}
              >
                <option>Code Review MCP</option>
                <option>Research MCP</option>
                <option>Data Analyst MCP</option>
                <option>DevOps MCP</option>
                <option>Custom</option>
              </select>
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-[0.8125rem] font-semibold text-[#e7ece7]">Task description</span>
              <textarea
                className={`${fieldClass} min-h-[5.75rem] resize-y`}
                value={taskProfile.description}
                onChange={(event) => setTaskProfile((current) => ({ ...current, description: event.target.value }))}
                placeholder="Describe the job this gateway should handle."
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-[0.8125rem] font-semibold text-[#e7ece7]">System instruction / notes</span>
              <textarea
                className={`${fieldClass} min-h-[5.75rem] resize-y`}
                value={taskProfile.systemNotes}
                onChange={(event) => setTaskProfile((current) => ({ ...current, systemNotes: event.target.value }))}
                placeholder="Optional routing, approval, or behavior notes."
              />
            </label>
          </div>
        </Panel>
      )}

      {activeStep === "servers" && (
        <>
          <ServerPool
            servers={serverPool}
            testingServerId={testingServerId}
            discoveringServerId={discoveringServerId}
            onToggleDisabled={toggleServerDisabled}
            onInspect={(serverId) => void inspectServer(serverId)}
            onTest={(server) => void testConnection(server)}
            onRemove={removeServer}
          />
          <ServerSetupTabs
            activeTab={serverSetupTab}
            onTabChange={setServerSetupTab}
            catalog={
              <ServerDiscovery
                catalog={catalog}
                poolIds={serverPool.map((server) => server.id)}
                query={catalogQuery}
                isLoading={catalogLoading}
                isLoadingMore={catalogLoadingMore}
                hasMore={Boolean(catalogCursor)}
                error={catalogError}
                sources={catalogSources}
                onQueryChange={setCatalogQuery}
                onAdd={addServer}
                onRetry={() => void fetchCatalog(catalogQuery)}
                onLoadMore={() => void loadMoreCatalog()}
              />
            }
            manual={<ManualServerForm onAdd={addServer} />}
          />
        </>
      )}

      {activeStep === "tools" && (
        <>
          <div id="tool-picker">
            <ToolPicker
              servers={serverPool}
              focusServerId={focusServerId}
              onToggleTool={toggleTool}
              onAliasChange={changeAlias}
              onPermissionChange={changePermission}
            />
          </div>
          {aliasConflicts(selectedTools).length > 0 && (
            <div className="flex items-start gap-3 rounded-md border border-[#7b3030] bg-[#361717] p-4 text-[0.8125rem] text-[#ffb3b3]">
              <AlertCircle size="1rem" className="mt-0.5 shrink-0" />
              Alias conflicts must be resolved before generation: {aliasConflicts(selectedTools).join(", ")}
            </div>
          )}
        </>
      )}

      {activeStep === "output" && (
        <>
          <GatewayOutput
            generated={generated}
            onCopy={handleCopy}
            onDownload={handleDownload}
            onReset={resetOutput}
          />
          <AuditLog entries={auditLog} />
          <Roadmap />
        </>
      )}

      {activeStep !== "servers" && navigation}

      <footer className="flex flex-col gap-x-6 gap-y-2 border-t border-[#343d34] py-5 text-[0.75rem] text-[#a9b4aa] md:flex-row md:flex-wrap md:items-center md:justify-between">
        <span className="inline-flex items-center gap-2">
          <CheckCircle2 size="0.875rem" className="text-[#2bb3a3]" />
          Backend API base: {API_BASE_URL}
        </span>
        <span className="inline-flex items-center gap-2">
          <ServerCrash size="0.875rem" className="text-[#2bb3a3]" />
          Real MCP SDK connector for upstream discovery and calls.
        </span>
        <span className="inline-flex items-center gap-2">
          <FileText size="0.875rem" className="text-[#2bb3a3]" />
          Current output size: {generated ? formatJson(generated.gateway_config_json).length : 0} chars
        </span>
      </footer>
    </AppShell>
  );
}

export default App;

function StepNavigation({
  activeStep,
  stepNumber,
  totalSteps,
  nextDisabled,
  isGenerating,
  onBack,
  onNext
}: {
  activeStep: BuilderStep;
  stepNumber: number;
  totalSteps: number;
  nextDisabled: boolean;
  isGenerating: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const isFirst = activeStep === "profile";
  const isLast = activeStep === "output";
  const nextLabel = activeStep === "tools" ? (isGenerating ? "Generating..." : "Generate and review") : "Next";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[#343d34] bg-[#191d19] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[0.75rem] font-semibold uppercase text-[#a9b4aa]">
          Step {stepNumber} of {totalSteps}
        </p>
        <p className="mt-1 text-[0.8125rem] text-[#a9b4aa]">
          {activeStep === "servers"
            ? "Catalog and manual additions both update the same server pool."
            : activeStep === "tools"
              ? "Select at least one tool, then generate the gateway."
              : activeStep === "output"
                ? "Review, copy, or download the generated artifacts."
                : "Define the task before choosing upstream capabilities."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button variant="secondary" onClick={onBack} disabled={isFirst} leftIcon={<ArrowLeft size="0.9375rem" />}>
          Back
        </Button>
        {!isLast && (
          <Button
            variant="primary"
            onClick={onNext}
            disabled={nextDisabled}
            leftIcon={activeStep === "tools" ? <Sparkles size="0.9375rem" /> : <ArrowRight size="0.9375rem" />}
          >
            {nextLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
