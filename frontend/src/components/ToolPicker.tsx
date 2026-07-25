import { Wrench } from "lucide-react";
import { memo, useMemo } from "react";

import { compositionActions, useCompositionSelector } from "../lib/compositionStore";
import { reportRender } from "../lib/renderAudit";
import { namespaceToolName } from "../lib/utils";
import { Panel } from "./Panel";
import { ToolCard } from "./ToolCard";
import styles from "./ToolPicker.module.scss";

interface ToolServerGroupProps {
  serverId: string;
}

const CONFLICT_SEPARATOR = "\u0000";

export const ToolPicker = memo(function ToolPicker() {
  if (import.meta.env.DEV) reportRender("ToolPicker");

  const serverIds = useCompositionSelector((current) => current.serverIds);
  const focusServerId = useCompositionSelector((current) => current.focusServerId);
  const hasTools = useCompositionSelector((current) => current.hasDiscoveredTools);
  const orderedServers = useMemo(() => {
    if (!focusServerId) return serverIds;
    return [...serverIds].sort((a, b) => {
      if (a === focusServerId) return -1;
      if (b === focusServerId) return 1;
      return 0;
    });
  }, [focusServerId, serverIds]);

  return (
    <Panel
      title="Tool Picker"
      subtitle="Select tools from multiple upstream servers and configure aliases, risk posture, and permissions."
    >
      {serverIds.length > 0 && hasTools ? (
        <div className={styles.serverList}>
          {orderedServers.map((serverId) => (
            <ToolServerGroup key={serverId} serverId={serverId} />
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>
            <Wrench size="1rem" className={styles.emptyIcon} />
            No tools available
          </div>
          {serverIds.length
            ? "Run Discover tools from Server Pool. Live MCP tools will appear grouped by upstream server."
            : "Add at least one server to the pool and run Discover tools. Live MCP tools will appear grouped by upstream server."}
        </div>
      )}
    </Panel>
  );
});

const ToolServerGroup = memo(function ToolServerGroup({ serverId }: ToolServerGroupProps) {
  if (import.meta.env.DEV) reportRender(`ToolServerGroup:${serverId}`);

  const server = useCompositionSelector((current) => current.serverById.get(serverId));
  const focused = useCompositionSelector((current) => current.focusServerId === serverId);
  const conflictKey = useCompositionSelector((current) => current.conflictKeyByServerId.get(serverId) ?? "");

  const conflictingAliases = useMemo(
    () => new Set(conflictKey ? conflictKey.split(CONFLICT_SEPARATOR) : []),
    [conflictKey]
  );

  if (!server) return null;

  return (
    <section className={focused ? styles.focusedServer : undefined}>
      <div className={styles.serverHeader}>
        <div>
          <h3 className={styles.serverTitle}>{server.name}</h3>
          <p className={styles.serverMeta}>
            {server.tools.filter((tool) => tool.enabled).length}/{server.tools.length} selected
          </p>
        </div>
        <span className={styles.transport}>{server.transport}</span>
      </div>
      <div className={styles.toolList}>
        {server.tools.length ? (
          server.tools.map((tool) => (
            <ToolCard
              key={tool.id}
              serverId={server.id}
              tool={tool}
              namespacePreview={namespaceToolName(server, tool.originalName)}
              aliasConflict={tool.enabled && conflictingAliases.has(tool.exposedName)}
              onToggle={compositionActions.toggleTool}
              onAliasChange={compositionActions.changeAlias}
              onPermissionChange={compositionActions.changePermission}
            />
          ))
        ) : (
          <div className={styles.emptyServer}>
            Discover tools for this server from Server Pool before selecting capabilities.
          </div>
        )}
      </div>
    </section>
  );
});
