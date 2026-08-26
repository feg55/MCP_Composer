import { useCallback, useState, useSyncExternalStore } from "react";

import { pushAudit } from "./activityStore";
import { api } from "./api";
import { getTaskProfileRevision, getTaskProfileSnapshot, subscribeTaskProfileMutations } from "./taskProfileStore";
import type { GeneratedGatewayResponse, McpServerDefinition, McpToolDefinition, PermissionMode } from "./types";
import {
  aliasConflicts,
  buildComposition,
  cloneServer,
  formatJson,
  riskCounts,
  selectedToolsFromServers
} from "./utils";

export type BuilderStep = "profile" | "servers" | "tools" | "output";

export interface CompositionSnapshot {
  serverPool: McpServerDefinition[];
  serverIds: string[];
  serverById: ReadonlyMap<string, McpServerDefinition>;
  selectedTools: McpToolDefinition[];
  conflicts: string[];
  conflictKeyByServerId: ReadonlyMap<string, string>;
  conflictMessage: string | null;
  readCount: number;
  writeCount: number;
  externalCount: number;
  destructiveCount: number;
  serverCount: number;
  selectedToolCount: number;
  hasDiscoveredTools: boolean;
  hasServerErrors: boolean;
  generated: GeneratedGatewayResponse | null;
  outputSize: number;
  testingServerIds: ReadonlySet<string>;
  discoveringServerIds: ReadonlySet<string>;
  credentialsByServerId: ReadonlyMap<string, Readonly<Record<string, string>>>;
  focusServerId: string | null;
  isGenerating: boolean;
  activeStep: BuilderStep;
}

interface CompositionCore {
  serverPool: McpServerDefinition[];
  generated: GeneratedGatewayResponse | null;
  testingServerIds: ReadonlySet<string>;
  discoveringServerIds: ReadonlySet<string>;
  credentialsByServerId: ReadonlyMap<string, Readonly<Record<string, string>>>;
  focusServerId: string | null;
  isGenerating: boolean;
  activeStep: BuilderStep;
}

type Listener = () => void;
type CorePatch = Partial<CompositionCore>;

const EMPTY_IDS: string[] = [];
const EMPTY_SERVERS = new Map<string, McpServerDefinition>();
const EMPTY_TOOLS: McpToolDefinition[] = [];
const EMPTY_CONFLICTS: string[] = [];
const EMPTY_CONFLICT_KEYS = new Map<string, string>();
const EMPTY_OPERATIONS = new Set<string>();
const EMPTY_CREDENTIALS = new Map<string, Readonly<Record<string, string>>>();
const listeners = new Set<Listener>();

function sameItems<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((item, index) => Object.is(item, right[index]));
}

function deriveSnapshot(core: CompositionCore, previous?: CompositionSnapshot): CompositionSnapshot {
  const poolChanged = !previous || !Object.is(core.serverPool, previous.serverPool);
  const generatedChanged = !previous || !Object.is(core.generated, previous.generated);

  let serverIds = previous?.serverIds ?? EMPTY_IDS;
  let serverById = previous?.serverById ?? EMPTY_SERVERS;
  let selectedTools = previous?.selectedTools ?? EMPTY_TOOLS;
  let conflicts = previous?.conflicts ?? EMPTY_CONFLICTS;
  let conflictKeyByServerId = previous?.conflictKeyByServerId ?? EMPTY_CONFLICT_KEYS;
  let readCount = previous?.readCount ?? 0;
  let writeCount = previous?.writeCount ?? 0;
  let externalCount = previous?.externalCount ?? 0;
  let destructiveCount = previous?.destructiveCount ?? 0;
  let hasDiscoveredTools = previous?.hasDiscoveredTools ?? false;
  let hasServerErrors = previous?.hasServerErrors ?? false;

  if (poolChanged) {
    const nextIds = core.serverPool.map((server) => server.id);
    serverIds = previous && sameItems(previous.serverIds, nextIds) ? previous.serverIds : nextIds;
    serverById = new Map(core.serverPool.map((server) => [server.id, server]));

    const nextSelectedTools = selectedToolsFromServers(core.serverPool);
    selectedTools =
      previous && sameItems(previous.selectedTools, nextSelectedTools) ? previous.selectedTools : nextSelectedTools;

    const nextConflicts = aliasConflicts(nextSelectedTools);
    conflicts = previous && sameItems(previous.conflicts, nextConflicts) ? previous.conflicts : nextConflicts;
    const conflictingAliases = new Set(nextConflicts);
    conflictKeyByServerId = new Map(
      core.serverPool.map((server) => [
        server.id,
        server.tools
          .filter((tool) => tool.enabled && conflictingAliases.has(tool.exposedName))
          .map((tool) => tool.exposedName)
          .sort()
          .join("\u0000")
      ])
    );

    const counts = riskCounts(nextSelectedTools);
    readCount = counts.read;
    writeCount = counts.write;
    externalCount = counts.external;
    destructiveCount = counts.destructive;
    hasDiscoveredTools = core.serverPool.some((server) => server.tools.length > 0);
    hasServerErrors = core.serverPool.some((server) => server.status === "error");
  }

  return {
    ...core,
    serverIds,
    serverById,
    selectedTools,
    conflicts,
    conflictKeyByServerId,
    conflictMessage: conflicts.length ? `Alias conflicts: ${conflicts.join(", ")}` : null,
    readCount,
    writeCount,
    externalCount,
    destructiveCount,
    serverCount: core.serverPool.length,
    selectedToolCount: selectedTools.length,
    hasDiscoveredTools,
    hasServerErrors,
    outputSize: generatedChanged
      ? core.generated
        ? formatJson(core.generated.gateway_config_json).length
        : 0
      : (previous?.outputSize ?? 0)
  };
}

const initialCore: CompositionCore = {
  serverPool: [],
  generated: null,
  testingServerIds: EMPTY_OPERATIONS,
  discoveringServerIds: EMPTY_OPERATIONS,
  credentialsByServerId: EMPTY_CREDENTIALS,
  focusServerId: null,
  isGenerating: false,
  activeStep: "profile"
};

let snapshot = deriveSnapshot(initialCore);
let storeEpoch = 0;
let compositionRevision = 0;
let generationRequestId = 0;

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitChange(): void {
  listeners.forEach((listener) => listener());
}

function commit(patch: CorePatch): void {
  const currentCore: CompositionCore = {
    serverPool: snapshot.serverPool,
    generated: snapshot.generated,
    testingServerIds: snapshot.testingServerIds,
    discoveringServerIds: snapshot.discoveringServerIds,
    credentialsByServerId: snapshot.credentialsByServerId,
    focusServerId: snapshot.focusServerId,
    isGenerating: snapshot.isGenerating,
    activeStep: snapshot.activeStep
  };
  const nextCore = { ...currentCore, ...patch };
  const changed = (Object.keys(patch) as Array<keyof CompositionCore>).some(
    (key) => !Object.is(currentCore[key], nextCore[key])
  );
  if (!changed) return;

  snapshot = deriveSnapshot(nextCore, snapshot);
  emitChange();
}

function commitCompositionMutation(patch: CorePatch): void {
  compositionRevision += 1;
  generationRequestId += 1;

  const nextPool = patch.serverPool ?? snapshot.serverPool;
  const leavesOutput = snapshot.activeStep === "output" && (patch.generated ?? null) === null;
  commit({
    ...patch,
    generated: null,
    isGenerating: false,
    ...(leavesOutput
      ? {
          activeStep: nextPool.some((server) => server.tools.length > 0) ? ("tools" as const) : ("servers" as const)
        }
      : {})
  });
}

function updateServer(serverId: string, update: (server: McpServerDefinition) => McpServerDefinition): boolean {
  const index = snapshot.serverPool.findIndex((server) => server.id === serverId);
  if (index < 0) return false;
  const current = snapshot.serverPool[index];
  const next = update(current);
  if (Object.is(current, next)) return false;

  const serverPool = snapshot.serverPool.slice();
  serverPool[index] = next;
  commitCompositionMutation({ serverPool });
  return true;
}

function mergeDiscoveredTools(existing: McpToolDefinition[], discovered: McpToolDefinition[]): McpToolDefinition[] {
  const existingByName = new Map(existing.map((tool) => [tool.originalName, tool]));
  const mergedTools = discovered.map((tool) => {
    const current = existingByName.get(tool.originalName);
    if (!current) return tool;
    const merged = {
      ...tool,
      enabled: current.enabled,
      exposedName: current.exposedName,
      permission: current.permission
    };
    const unchanged =
      current.id === merged.id &&
      current.serverId === merged.serverId &&
      current.originalName === merged.originalName &&
      current.exposedName === merged.exposedName &&
      current.description === merged.description &&
      current.riskLevel === merged.riskLevel &&
      current.permission === merged.permission &&
      current.enabled === merged.enabled &&
      formatJson(current.inputSchema) === formatJson(merged.inputSchema);
    return unchanged ? current : merged;
  });
  return sameItems(existing, mergedTools) ? existing : mergedTools;
}

function removeFromSet(current: ReadonlySet<string>, value: string): ReadonlySet<string> {
  if (!current.has(value)) return current;
  const next = new Set(current);
  next.delete(value);
  return next;
}

function isBusy(serverId: string): boolean {
  return snapshot.testingServerIds.has(serverId) || snapshot.discoveringServerIds.has(serverId);
}

function withRuntimeCredentials(server: McpServerDefinition): McpServerDefinition {
  const credentials = snapshot.credentialsByServerId.get(server.id);
  return credentials ? { ...server, env: { ...server.env, ...credentials } } : server;
}

function canEnterStep(step: BuilderStep, current = snapshot): boolean {
  if (step === "tools") return current.hasDiscoveredTools;
  if (step === "output") return current.generated !== null;
  return true;
}

async function inspectServer(serverId: string): Promise<void> {
  if (isBusy(serverId)) return;
  const server = snapshot.serverById.get(serverId);
  if (!server) return;
  const operationEpoch = storeEpoch;

  commit({ discoveringServerIds: new Set(snapshot.discoveringServerIds).add(serverId) });
  try {
    const result = await api.discoverTools(withRuntimeCredentials(server));
    if (operationEpoch !== storeEpoch) return;
    const current = snapshot.serverById.get(serverId);
    const mappedPool = current
      ? snapshot.serverPool.map((item) =>
          item.id === serverId
            ? (() => {
                const tools = result.status === "ready" ? mergeDiscoveredTools(item.tools, result.tools) : item.tools;
                return item.status === result.status && item.tools === tools
                  ? item
                  : { ...item, status: result.status, tools };
              })()
            : item
        )
      : snapshot.serverPool;
    const nextPool = sameItems(snapshot.serverPool, mappedPool) ? snapshot.serverPool : mappedPool;
    const completionPatch: CorePatch = {
      serverPool: nextPool,
      discoveringServerIds: removeFromSet(snapshot.discoveringServerIds, serverId)
    };
    if (nextPool === snapshot.serverPool) commit(completionPatch);
    else commitCompositionMutation(completionPatch);
    pushAudit(
      "tools_discovered",
      `${server.name}: ${result.message}`,
      result.status === "ready" ? "success" : result.status === "needs_auth" ? "warning" : "error"
    );
  } catch (error) {
    if (operationEpoch !== storeEpoch) return;
    const message = error instanceof Error ? error.message : "Tool discovery failed.";
    const current = snapshot.serverById.get(serverId);
    const mappedPool = current
      ? snapshot.serverPool.map((item) =>
          item.id === serverId && item.status !== "error" ? { ...item, status: "error" as const } : item
        )
      : snapshot.serverPool;
    const nextPool = sameItems(snapshot.serverPool, mappedPool) ? snapshot.serverPool : mappedPool;
    const completionPatch: CorePatch = {
      serverPool: nextPool,
      discoveringServerIds: removeFromSet(snapshot.discoveringServerIds, serverId)
    };
    if (nextPool === snapshot.serverPool) commit(completionPatch);
    else commitCompositionMutation(completionPatch);
    pushAudit("tools_discovered", `${server.name}: ${message}`, "error");
  }
}

async function testConnection(serverId: string): Promise<void> {
  if (isBusy(serverId)) return;
  const server = snapshot.serverById.get(serverId);
  if (!server) return;
  const operationEpoch = storeEpoch;

  commit({ testingServerIds: new Set(snapshot.testingServerIds).add(serverId) });
  try {
    const result = await api.testConnection(withRuntimeCredentials(server));
    if (operationEpoch !== storeEpoch) return;
    const current = snapshot.serverById.get(serverId);
    const mappedPool = current
      ? snapshot.serverPool.map((item) =>
          item.id === serverId && item.status !== result.status ? { ...item, status: result.status } : item
        )
      : snapshot.serverPool;
    const nextPool = sameItems(snapshot.serverPool, mappedPool) ? snapshot.serverPool : mappedPool;
    const completionPatch: CorePatch = {
      serverPool: nextPool,
      testingServerIds: removeFromSet(snapshot.testingServerIds, serverId)
    };
    if (nextPool === snapshot.serverPool) commit(completionPatch);
    else commitCompositionMutation(completionPatch);
    pushAudit(
      "connection_tested",
      `${server.name}: ${result.message}`,
      result.status === "ready" ? "success" : result.status === "needs_auth" ? "warning" : "error"
    );
  } catch (error) {
    if (operationEpoch !== storeEpoch) return;
    const message = error instanceof Error ? error.message : "Connection test failed.";
    const current = snapshot.serverById.get(serverId);
    const mappedPool = current
      ? snapshot.serverPool.map((item) =>
          item.id === serverId && item.status !== "error" ? { ...item, status: "error" as const } : item
        )
      : snapshot.serverPool;
    const nextPool = sameItems(snapshot.serverPool, mappedPool) ? snapshot.serverPool : mappedPool;
    const completionPatch: CorePatch = {
      serverPool: nextPool,
      testingServerIds: removeFromSet(snapshot.testingServerIds, serverId)
    };
    if (nextPool === snapshot.serverPool) commit(completionPatch);
    else commitCompositionMutation(completionPatch);
    pushAudit("connection_tested", `${server.name}: ${message}`, "error");
  }
}

async function generateGateway(): Promise<boolean> {
  if (snapshot.isGenerating) return false;
  const requestId = ++generationRequestId;
  const requestEpoch = storeEpoch;
  const requestRevision = compositionRevision;
  const profileRevision = getTaskProfileRevision();
  const currentServers = snapshot.serverPool;
  const composition = buildComposition(
    getTaskProfileSnapshot(),
    currentServers,
    selectedToolsFromServers(currentServers)
  );
  commit({ isGenerating: true });
  const isCurrentRequest = () =>
    requestId === generationRequestId &&
    requestEpoch === storeEpoch &&
    requestRevision === compositionRevision &&
    profileRevision === getTaskProfileRevision();

  try {
    const validation = await api.validateComposition(composition);
    if (!isCurrentRequest()) return false;
    if (!validation.valid) {
      commit({ isGenerating: false });
      pushAudit("gateway_generated", `Generation blocked: ${validation.errors.join(" ")}`, "error");
      return false;
    }

    const response = await api.generateGateway(composition);
    if (!isCurrentRequest()) return false;
    commit({ generated: response, isGenerating: false, activeStep: "output" });
    pushAudit(
      "gateway_generated",
      `Generated ${response.exposed_tools.length} exposed tools for ${composition.name}.`,
      "success"
    );
    return true;
  } catch (error) {
    if (!isCurrentRequest()) return false;
    const message = error instanceof Error ? error.message : "Gateway generation failed.";
    commit({ isGenerating: false });
    pushAudit("gateway_generated", message, "error");
    return false;
  }
}

export const compositionActions = {
  addServer(server: McpServerDefinition): void {
    if (snapshot.serverById.has(server.id)) {
      pushAudit("server_added", `${server.name} is already in the pool.`, "warning");
      return;
    }

    const cloned = cloneServer(server);
    commitCompositionMutation({ serverPool: [...snapshot.serverPool, cloned] });
    pushAudit("server_added", `${cloned.name} added to the server pool.`, "success");
    if (cloned.status !== "disabled") void inspectServer(cloned.id);
  },

  removeServer(serverId: string): void {
    const server = snapshot.serverById.get(serverId);
    if (!server) return;
    if (isBusy(serverId)) {
      pushAudit("server_removed", `${server.name} cannot be removed while an operation is running.`, "warning");
      return;
    }

    const credentialsByServerId = new Map(snapshot.credentialsByServerId);
    credentialsByServerId.delete(serverId);
    commitCompositionMutation({
      serverPool: snapshot.serverPool.filter((item) => item.id !== serverId),
      credentialsByServerId,
      focusServerId: snapshot.focusServerId === serverId ? null : snapshot.focusServerId
    });
    pushAudit("server_removed", `${server.name} removed from the pool.`, "warning");
  },

  toggleServerDisabled(serverId: string): void {
    const server = snapshot.serverById.get(serverId);
    if (!server) return;
    const nextStatus = server.status === "disabled" ? "ready" : "disabled";
    if (!updateServer(serverId, (item) => ({ ...item, status: nextStatus }))) return;
    pushAudit("server_status", `${server.name} ${nextStatus === "disabled" ? "disabled" : "enabled"}.`, "info");
  },

  setServerCredential(serverId: string, key: string, value: string): void {
    const server = snapshot.serverById.get(serverId);
    if (!server || !(key in server.env)) return;
    const nextValue = value.trim();
    const credentials = { ...(snapshot.credentialsByServerId.get(serverId) ?? {}) };
    if (nextValue) credentials[key] = nextValue;
    else delete credentials[key];
    const credentialsByServerId = new Map(snapshot.credentialsByServerId);
    if (Object.keys(credentials).length) credentialsByServerId.set(serverId, credentials);
    else credentialsByServerId.delete(serverId);
    commit({ credentialsByServerId });
    pushAudit(
      "server_credentials",
      `${server.name}: ${key} ${nextValue ? "configured for this session" : "cleared"}.`,
      nextValue ? "success" : "warning"
    );
    if (nextValue && !isBusy(serverId)) void inspectServer(serverId);
  },

  inspectServer,
  testConnection,

  toggleTool(serverId: string, toolId: string, enabled: boolean, toolName: string): void {
    const changed = updateServer(serverId, (server) => {
      const tool = server.tools.find((item) => item.id === toolId);
      if (!tool || tool.enabled === enabled) return server;
      return {
        ...server,
        tools: server.tools.map((item) => (item.id === toolId ? { ...item, enabled } : item))
      };
    });
    if (changed) {
      pushAudit(enabled ? "tool_enabled" : "tool_disabled", `${toolName} ${enabled ? "enabled" : "disabled"}.`, "info");
    }
  },

  changeAlias(serverId: string, toolId: string, alias: string): void {
    updateServer(serverId, (server) => {
      const tool = server.tools.find((item) => item.id === toolId);
      if (!tool || tool.exposedName === alias) return server;
      return {
        ...server,
        tools: server.tools.map((item) => (item.id === toolId ? { ...item, exposedName: alias } : item))
      };
    });
  },

  changePermission(serverId: string, toolId: string, permission: PermissionMode, toolName: string): void {
    const changed = updateServer(serverId, (server) => {
      const tool = server.tools.find((item) => item.id === toolId);
      if (!tool || tool.permission === permission) return server;
      return {
        ...server,
        tools: server.tools.map((item) => (item.id === toolId ? { ...item, permission } : item))
      };
    });
    if (changed) pushAudit("permission_changed", `${toolName} permission set to ${permission}.`, "info");
  },

  setActiveStep(step: BuilderStep): void {
    if (step === snapshot.activeStep || !canEnterStep(step)) return;
    commit({ activeStep: step });
  },

  goBack(): void {
    const steps: BuilderStep[] = ["profile", "servers", "tools", "output"];
    const previous = steps[steps.indexOf(snapshot.activeStep) - 1];
    if (previous) commit({ activeStep: previous });
  },

  goNext(): void {
    if (snapshot.activeStep === "tools") {
      void generateGateway();
      return;
    }
    const steps: BuilderStep[] = ["profile", "servers", "tools", "output"];
    const next = steps[steps.indexOf(snapshot.activeStep) + 1];
    if (next && canEnterStep(next)) commit({ activeStep: next });
  },

  generateGateway,

  resetOutput(): void {
    if (!snapshot.generated) return;
    commit({
      generated: null,
      activeStep: snapshot.hasDiscoveredTools ? "tools" : "servers"
    });
    pushAudit("gateway_reset", "Generated gateway output cleared.", "info");
  }
} as const;

subscribeTaskProfileMutations(() => {
  commitCompositionMutation({});
});

type EqualityFn<T> = (left: T, right: T) => boolean;

class SelectorCache<T> {
  private hasValue = false;
  private value: T | undefined;

  select(nextValue: T, equalityFn: EqualityFn<T>): T {
    if (this.hasValue && equalityFn(this.value as T, nextValue)) return this.value as T;
    this.hasValue = true;
    this.value = nextValue;
    return nextValue;
  }
}

function shallowEqual<T>(left: T, right: T): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => Object.is(item, right[index]))
    );
  }
  if (left instanceof Map || right instanceof Map || left instanceof Set || right instanceof Set) return false;
  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) => Object.prototype.hasOwnProperty.call(rightRecord, key) && Object.is(leftRecord[key], rightRecord[key])
    )
  );
}

export function useCompositionSelector<T>(
  selector: (current: CompositionSnapshot) => T,
  equalityFn: EqualityFn<T> = shallowEqual
): T {
  const [cache] = useState(() => new SelectorCache<T>());

  const getSelectedSnapshot = useCallback(() => {
    const selected = selector(snapshot);
    return cache.select(selected, equalityFn);
  }, [cache, equalityFn, selector]);

  return useSyncExternalStore(subscribe, getSelectedSnapshot, getSelectedSnapshot);
}

export function resetCompositionStoreForTests(): void {
  storeEpoch += 1;
  compositionRevision = 0;
  generationRequestId += 1;
  snapshot = deriveSnapshot({
    serverPool: [],
    generated: null,
    testingServerIds: EMPTY_OPERATIONS,
    discoveringServerIds: EMPTY_OPERATIONS,
    credentialsByServerId: EMPTY_CREDENTIALS,
    focusServerId: null,
    isGenerating: false,
    activeStep: "profile"
  });
  emitChange();
}
