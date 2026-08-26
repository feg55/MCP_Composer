import { ChevronDown, ChevronRight } from "lucide-react";
import { memo, type ChangeEvent, type MouseEvent, useCallback, useState } from "react";

import { RiskBadge } from "./Badge";
import { reportRender } from "../lib/renderAudit";
import type { McpToolDefinition, PermissionMode } from "../lib/types";
import { cn, formatJson } from "../lib/utils";
import styles from "./ToolCard.module.scss";

interface ToolCardProps {
  serverId: string;
  tool: McpToolDefinition;
  namespacePreview: string;
  aliasConflict: boolean;
  onToggle: (serverId: string, toolId: string, enabled: boolean, toolName: string) => void;
  onAliasChange: (serverId: string, toolId: string, alias: string) => void;
  onPermissionChange: (serverId: string, toolId: string, permission: PermissionMode, toolName: string) => void;
}

export const ToolCard = memo(function ToolCard({
  serverId,
  tool,
  namespacePreview,
  aliasConflict,
  onToggle,
  onAliasChange,
  onPermissionChange
}: ToolCardProps) {
  if (import.meta.env.DEV) reportRender(`ToolCard:${tool.id}`);

  const [schemaOpen, setSchemaOpen] = useState(false);

  const handleCardClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest("button,input,select,textarea,label,a,[data-no-card-toggle]")) return;
      onToggle(serverId, tool.id, !tool.enabled, tool.exposedName);
    },
    [onToggle, serverId, tool.enabled, tool.exposedName, tool.id]
  );

  const handleToggle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onToggle(serverId, tool.id, event.target.checked, tool.exposedName);
    },
    [onToggle, serverId, tool.exposedName, tool.id]
  );

  const handleAliasChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onAliasChange(serverId, tool.id, event.target.value);
    },
    [onAliasChange, serverId, tool.id]
  );

  const handlePermissionChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      onPermissionChange(serverId, tool.id, event.target.value as PermissionMode, tool.exposedName);
    },
    [onPermissionChange, serverId, tool.exposedName, tool.id]
  );

  const handleSchemaToggle = useCallback(() => {
    setSchemaOpen((current) => !current);
  }, []);

  return (
    <article onClick={handleCardClick} className={cn(styles.card, tool.enabled && styles.enabled)}>
      <div className={styles.layout}>
        <div className={styles.summary}>
          <label className={styles.checkboxLabel}>
            <span className={styles.visuallyHidden}>Enable {tool.originalName}</span>
            <input type="checkbox" className={styles.checkbox} checked={tool.enabled} onChange={handleToggle} />
          </label>
          <div className={styles.summaryBody}>
            <div className={styles.titleRow}>
              <h4 className={styles.title} title={tool.originalName}>
                {tool.originalName}
              </h4>
              <RiskBadge risk={tool.riskLevel} />
            </div>
            <p className={styles.description}>{tool.description}</p>
            <p className={styles.namespace} title={namespacePreview}>
              {namespacePreview}
            </p>
          </div>
        </div>
        <div className={styles.controls}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Exposed alias</span>
            <input
              className={cn(styles.input, aliasConflict && styles.inputError)}
              value={tool.exposedName}
              onChange={handleAliasChange}
              aria-invalid={aliasConflict}
            />
            {aliasConflict && <span className={styles.error}>Alias must be unique.</span>}
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Permission mode</span>
            <select className={styles.input} value={tool.permission} onChange={handlePermissionChange}>
              <option value="auto">auto</option>
              <option value="require_approval">require approval</option>
              <option value="disabled">disabled</option>
            </select>
          </label>
        </div>
      </div>

      <button type="button" className={styles.schemaToggle} onClick={handleSchemaToggle}>
        {schemaOpen ? <ChevronDown size="0.875rem" /> : <ChevronRight size="0.875rem" />}
        Input schema preview
      </button>
      {schemaOpen && (
        <pre data-no-card-toggle className={styles.schema}>
          {formatJson(tool.inputSchema)}
        </pre>
      )}
    </article>
  );
});
