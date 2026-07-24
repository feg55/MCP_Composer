import { Wrench } from "lucide-react";
import { useMemo } from "react";

import { Panel } from "./Panel";
import { ToolCard } from "./ToolCard";
import type { McpServerDefinition, PermissionMode } from "../lib/types";
import { aliasConflicts, namespaceToolName } from "../lib/utils";

interface ToolPickerProps {
  servers: McpServerDefinition[];
  focusServerId: string | null;
  onToggleTool: (serverId: string, toolId: string, enabled: boolean) => void;
  onAliasChange: (serverId: string, toolId: string, alias: string) => void;
  onPermissionChange: (serverId: string, toolId: string, permission: PermissionMode) => void;
}

export function ToolPicker({ servers, focusServerId, onToggleTool, onAliasChange, onPermissionChange }: ToolPickerProps) {
  const selectedTools = useMemo(() => servers.flatMap((server) => server.tools.filter((tool) => tool.enabled)), [servers]);
  const hasTools = servers.some((server) => server.tools.length > 0);
  const conflicts = useMemo(() => new Set(aliasConflicts(selectedTools)), [selectedTools]);
  const orderedServers = useMemo(() => {
    if (!focusServerId) return servers;
    return [...servers].sort((a, b) => {
      if (a.id === focusServerId) return -1;
      if (b.id === focusServerId) return 1;
      return 0;
    });
  }, [focusServerId, servers]);

  return (
    <Panel title="Tool Picker" subtitle="Select tools from multiple upstream servers and configure aliases, risk posture, and permissions.">
      {servers.length && hasTools ? (
        <div className="space-y-5">
          {orderedServers.map((server) => (
            <section
              key={server.id}
              className={focusServerId === server.id ? "rounded-lg border border-[#2bb3a3] bg-[#161d19] p-3" : undefined}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-[0.9375rem] font-semibold text-[#e7ece7]">{server.name}</h3>
                  <p className="text-[0.75rem] text-[#a9b4aa]">
                    {server.tools.filter((tool) => tool.enabled).length}/{server.tools.length} selected
                  </p>
                </div>
                <span className="rounded-md border border-[#343d34] bg-[#202620] px-2 py-1 text-[0.75rem] text-[#a9b4aa]">
                  {server.transport}
                </span>
              </div>
              <div className="space-y-3">
                {server.tools.length ? (
                  server.tools.map((tool) => (
                    <ToolCard
                      key={tool.id}
                      tool={tool}
                      namespacePreview={namespaceToolName(server, tool.originalName)}
                      aliasConflict={tool.enabled && conflicts.has(tool.exposedName)}
                      onToggle={(toolId, enabled) => onToggleTool(server.id, toolId, enabled)}
                      onAliasChange={(toolId, alias) => onAliasChange(server.id, toolId, alias)}
                      onPermissionChange={(toolId, permission) => onPermissionChange(server.id, toolId, permission)}
                    />
                  ))
                ) : (
                  <div className="rounded-md border border-dashed border-[#343d34] bg-[#111510] p-4 text-[0.8125rem] text-[#a9b4aa]">
                    Discover tools for this server from Server Pool before selecting capabilities.
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-[#343d34] bg-[#111510] p-5 text-[0.8125rem] leading-5 text-[#a9b4aa]">
          <div className="mb-2 flex items-center gap-2 text-[#e7ece7]">
            <Wrench size="1rem" className="text-[#2bb3a3]" />
            No tools available
          </div>
          {servers.length
            ? "Run Discover tools from Server Pool. Live MCP tools will appear grouped by upstream server."
            : "Add at least one server to the pool and run Discover tools. Live MCP tools will appear grouped by upstream server."}
        </div>
      )}
    </Panel>
  );
}
