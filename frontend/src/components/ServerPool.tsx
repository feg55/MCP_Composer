import { ChevronDown, ChevronRight, KeyRound, PlayCircle, Power, RefreshCw, Trash2 } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";

import { Badge, StatusBadge } from "./Badge";
import { Button } from "./Button";
import { Panel } from "./Panel";
import { compositionActions, useCompositionSelector } from "../lib/compositionStore";
import { reportRender } from "../lib/renderAudit";
import styles from "./ServerPool.module.scss";

interface ServerPoolCardProps {
  serverId: string;
}

interface CredentialEditorProps {
  serverId: string;
  env: Record<string, string>;
  disabled: boolean;
}

const CredentialEditor = memo(function CredentialEditor({ serverId, env, disabled }: CredentialEditorProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const credentials = useCompositionSelector((current) => current.credentialsByServerId.get(serverId));
  const requiredKeys = useMemo(
    () =>
      Object.entries(env)
        .filter(([key, value]) => value === `\${${key}}`)
        .map(([key]) => key),
    [env]
  );

  if (!requiredKeys.length) return null;

  return (
    <div className={styles.credentials}>
      <div className={styles.credentialsTitle}>
        <KeyRound size="0.875rem" />
        Session credentials
      </div>
      <p className={styles.credentialsHint}>Kept in memory only and cleared when this page is reloaded.</p>
      {requiredKeys.map((key) => {
        const configured = Boolean(credentials?.[key]);
        const draft = drafts[key] ?? "";
        return (
          <div key={key} className={styles.credentialRow}>
            <label className={styles.credentialField}>
              <span className={styles.credentialLabel}>
                {key} {configured && <span className={styles.configured}>configured</span>}
              </span>
              <input
                className={styles.credentialInput}
                type="password"
                value={draft}
                autoComplete="off"
                spellCheck={false}
                disabled={disabled}
                aria-label={`Credential ${key}`}
                onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
              />
            </label>
            <Button
              variant="secondary"
              disabled={disabled || !draft.trim()}
              onClick={() => {
                compositionActions.setServerCredential(serverId, key, draft);
                setDrafts((current) => ({ ...current, [key]: "" }));
              }}
            >
              Save
            </Button>
            {configured && (
              <Button
                variant="ghost"
                disabled={disabled}
                onClick={() => compositionActions.setServerCredential(serverId, key, "")}
              >
                Clear
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
});

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
          <CredentialEditor serverId={serverId} env={server.env} disabled={isTesting || isDiscovering} />
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
            {isDiscovering ? "Discovering tools" : server.tools.length ? "Refresh tools" : "Retry discovery"}
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
  const [collapsed, setCollapsed] = useState(false);
  const serverIds = useCompositionSelector((current) => current.serverIds);
  const discoveringCount = useCompositionSelector((current) => current.discoveringServerIds.size);

  const collapseAction = serverIds.length ? (
    <Button
      variant="ghost"
      aria-expanded={!collapsed}
      aria-controls="server-pool-list"
      onClick={() => setCollapsed((current) => !current)}
      leftIcon={collapsed ? <ChevronRight size="0.9375rem" /> : <ChevronDown size="0.9375rem" />}
    >
      {collapsed ? "Show servers" : "Hide servers"}
    </Button>
  ) : null;

  return (
    <Panel
      title="Server Pool"
      subtitle="Upstream servers added to the composition workspace. Tool discovery starts automatically."
      actions={collapseAction}
    >
      {serverIds.length ? (
        collapsed ? (
          <div className={styles.collapsedSummary} aria-live="polite">
            {serverIds.length} {serverIds.length === 1 ? "server" : "servers"}
            {discoveringCount > 0 && ` · discovering tools for ${discoveringCount}`}
          </div>
        ) : (
          <div id="server-pool-list" className={styles.list}>
            {serverIds.map((serverId) => (
              <ServerPoolCard key={serverId} serverId={serverId} />
            ))}
          </div>
        )
      ) : (
        <div className={styles.emptyState}>
          Add a server from discovery or manual configuration to start composing a gateway.
        </div>
      )}
    </Panel>
  );
});
