import { PlayCircle, Power, RefreshCw, Trash2 } from "lucide-react";
import { memo, useCallback } from "react";

import { Badge, StatusBadge } from "./Badge";
import { Button } from "./Button";
import { Panel } from "./Panel";
import { compositionActions, useCompositionSelector } from "../lib/compositionStore";
import { reportRender } from "../lib/renderAudit";
import styles from "./ServerPool.module.scss";

interface ServerPoolCardProps {
  serverId: string;
}

const ServerPoolCard = memo(function ServerPoolCard({ serverId }: ServerPoolCardProps) {
  if (import.meta.env.DEV) reportRender(`ServerPoolCard:${serverId}`);

  const server = useCompositionSelector((current) => current.serverById.get(serverId));
  const isTesting = useCompositionSelector((current) => current.testingServerIds.has(serverId));
  const isDiscovering = useCompositionSelector((current) => current.discoveringServerIds.has(serverId));

  const handleToggleDisabled = useCallback(() => compositionActions.toggleServerDisabled(serverId), [serverId]);
  const handleInspect = useCallback(() => void compositionActions.inspectServer(serverId), [serverId]);
  const handleTest = useCallback(() => void compositionActions.testConnection(serverId), [serverId]);
  const handleRemove = useCallback(() => compositionActions.removeServer(serverId), [serverId]);

  if (!server) return null;
  const selectedCount = server.tools.filter((tool) => tool.enabled).length;
  const isDisabled = server.status === "disabled";

  return (
    <article className={styles.card}>
      <div className={styles.cardLayout}>
        <div className={styles.details}>
          <div className={styles.titleRow}>
            <h3 className={styles.title}>{server.name}</h3>
            <Badge>{server.transport}</Badge>
            <StatusBadge status={server.status} />
          </div>
          <p className={styles.description}>{server.description}</p>
          <div className={styles.meta}>
            <span className={styles.metaItem}>
              {selectedCount}/{server.tools.length} tools selected
            </span>
            {!server.tools.length && <span className={styles.discoveryRequired}>discovery required</span>}
            <span className={styles.metaItem}>{server.source}</span>
          </div>
        </div>
        <div className={styles.actions}>
          <Button
            variant="secondary"
            onClick={handleToggleDisabled}
            disabled={isTesting || isDiscovering}
            leftIcon={<Power size="0.9375rem" />}
          >
            {isDisabled ? "Enable" : "Disable"}
          </Button>
          <Button
            variant="secondary"
            onClick={handleInspect}
            disabled={isDiscovering || isTesting || isDisabled}
            leftIcon={<RefreshCw size="0.9375rem" />}
          >
            {isDiscovering ? "Discovering" : server.tools.length ? "Refresh tools" : "Discover tools"}
          </Button>
          <Button
            variant="secondary"
            onClick={handleTest}
            disabled={isTesting || isDiscovering}
            leftIcon={<PlayCircle size="0.9375rem" />}
          >
            {isTesting ? "Testing" : "Test"}
          </Button>
          <Button
            variant="danger"
            onClick={handleRemove}
            disabled={isTesting || isDiscovering}
            leftIcon={<Trash2 size="0.9375rem" />}
          >
            Remove
          </Button>
        </div>
      </div>
    </article>
  );
});

export const ServerPool = memo(function ServerPool() {
  if (import.meta.env.DEV) reportRender("ServerPool");
  const serverIds = useCompositionSelector((current) => current.serverIds);

  return (
    <Panel title="Server Pool" subtitle="Upstream servers added to the composition workspace.">
      {serverIds.length ? (
        <div className={styles.list}>
          {serverIds.map((serverId) => (
            <ServerPoolCard key={serverId} serverId={serverId} />
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          Add a server from discovery or manual configuration to start composing a gateway.
        </div>
      )}
    </Panel>
  );
});
