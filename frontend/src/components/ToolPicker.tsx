import { ChevronDown, ChevronRight, ChevronsUpDown, Wrench } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";

import { compositionActions, useCompositionSelector } from "../lib/compositionStore";
import { reportRender } from "../lib/renderAudit";
import { cn, namespaceToolName } from "../lib/utils";
import { Button } from "./Button";
import { Panel } from "./Panel";
import { ToolCard } from "./ToolCard";
import styles from "./ToolPicker.module.scss";

interface ToolServerGroupProps {
  serverId: string;
  collapsed: boolean;
  onToggleCollapsed: (serverId: string) => void;
}

const CONFLICT_SEPARATOR = "\u0000";

export const ToolPicker = memo(function ToolPicker() {
  if (import.meta.env.DEV) reportRender("ToolPicker");

  const serverIds = useCompositionSelector((current) => current.serverIds);
  const focusServerId = useCompositionSelector((current) => current.focusServerId);
  const hasTools = useCompositionSelector((current) => current.hasDiscoveredTools);
  const [collapsedServerIds, setCollapsedServerIds] = useState<ReadonlySet<string>>(() => new Set());
  const orderedServers = useMemo(() => {
    if (!focusServerId) return serverIds;
    return [...serverIds].sort((a, b) => {
      if (a === focusServerId) return -1;
      if (b === focusServerId) return 1;
      return 0;
    });
  }, [focusServerId, serverIds]);
  const allCollapsed = serverIds.length > 0 && serverIds.every((serverId) => collapsedServerIds.has(serverId));
  const toggleServer = useCallback((serverId: string) => {
    setCollapsedServerIds((current) => {
      const next = new Set(current);
      if (next.has(serverId)) next.delete(serverId);
      else next.add(serverId);
      return next;
    });
  }, []);
  const toggleAll = useCallback(() => {
    setCollapsedServerIds((current) => {
      const shouldExpand = serverIds.length > 0 && serverIds.every((serverId) => current.has(serverId));
      return shouldExpand ? new Set() : new Set(serverIds);
    });
  }, [serverIds]);
  const collapseAction = serverIds.length > 0 && hasTools && (
    <Button variant="ghost" onClick={toggleAll} leftIcon={<ChevronsUpDown size="0.9375rem" />}>
      {allCollapsed ? "Show all tools" : "Hide all tools"}
    </Button>
  );

  return (
    <Panel
      title="Tool Picker"
      subtitle="Select tools from multiple upstream servers and configure aliases, risk posture, and permissions."
      actions={collapseAction}
    >
      {serverIds.length > 0 && hasTools ? (
        <div className={styles.serverList}>
          {orderedServers.map((serverId) => (
            <ToolServerGroup
              key={serverId}
              serverId={serverId}
              collapsed={collapsedServerIds.has(serverId)}
              onToggleCollapsed={toggleServer}
            />
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>
            <Wrench size="1rem" className={styles.emptyIcon} />
            No tools available
          </div>
          {serverIds.length
            ? "Tool discovery is running automatically. You can retry it from Server Pool if a server fails."
            : "Add at least one server to the pool. Tool discovery will start automatically."}
        </div>
      )}
    </Panel>
  );
});

const ToolServerGroup = memo(function ToolServerGroup({
  serverId,
  collapsed,
  onToggleCollapsed
}: ToolServerGroupProps) {
  if (import.meta.env.DEV) reportRender(`ToolServerGroup:${serverId}`);

  const server = useCompositionSelector((current) => current.serverById.get(serverId));
  const focused = useCompositionSelector((current) => current.focusServerId === serverId);
  const conflictKey = useCompositionSelector((current) => current.conflictKeyByServerId.get(serverId) ?? "");

  const conflictingAliases = useMemo(
    () => new Set(conflictKey ? conflictKey.split(CONFLICT_SEPARATOR) : []),
    [conflictKey]
  );
  const handleToggleCollapsed = useCallback(() => onToggleCollapsed(serverId), [onToggleCollapsed, serverId]);

  if (!server) return null;

  return (
    <section className={cn(focused && styles.focusedServer, collapsed && styles.collapsedServer)}>
      <div className={cn(styles.serverHeader, collapsed && styles.serverHeaderCollapsed)}>
        <div>
          <h3 className={styles.serverTitle}>{server.name}</h3>
          <p className={styles.serverMeta}>
            {server.tools.filter((tool) => tool.enabled).length}/{server.tools.length} selected
          </p>
        </div>
        <div className={styles.serverActions}>
          <span className={styles.transport}>{server.transport}</span>
          <Button
            variant="ghost"
            aria-expanded={!collapsed}
            aria-controls={`tool-list-${server.id}`}
            aria-label={`${collapsed ? "Show" : "Hide"} tools for ${server.name}`}
            onClick={handleToggleCollapsed}
            leftIcon={collapsed ? <ChevronRight size="0.9375rem" /> : <ChevronDown size="0.9375rem" />}
          >
            {collapsed ? "Show tools" : "Hide tools"}
          </Button>
        </div>
      </div>
      {!collapsed && (
        <div id={`tool-list-${server.id}`} className={styles.toolList}>
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
              This server has no discovered tools yet. Wait for automatic discovery or retry it from Server Pool.
            </div>
          )}
        </div>
      )}
    </section>
  );
});
