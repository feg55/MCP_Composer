import { AlertTriangle, Layers3, Server, Sparkles, Wrench } from "lucide-react";
import { memo } from "react";

import { compositionActions, useCompositionSelector } from "../lib/compositionStore";
import { reportRender } from "../lib/renderAudit";
import { useTaskDescriptionMissing, useTaskProfileField } from "../lib/taskProfileStore";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Panel } from "./Panel";
import styles from "./GatewaySummary.module.scss";

export const GatewaySummary = memo(function GatewaySummary() {
  if (import.meta.env.DEV) reportRender("GatewaySummary");

  return (
    <Panel className={styles.summary} title="Gateway Summary" subtitle="Live composition readiness and risk overview.">
      <div className={styles.content}>
        <GatewayIdentity />
        <Metrics />
        <RiskBreakdown />
        <Warnings />
      </div>

      <GenerateButton />
    </Panel>
  );
});

const GatewayIdentity = memo(function GatewayIdentity() {
  if (import.meta.env.DEV) reportRender("GatewayIdentity");

  return (
    <div className={styles.card}>
      <p className={styles.eyebrow}>Output MCP</p>
      <GatewayName />
      <GatewayDescription />
    </div>
  );
});

function GatewayName() {
  if (import.meta.env.DEV) reportRender("GatewayName");
  const gatewayName = useTaskProfileField("name");
  return <h3 className={styles.gatewayName}>{gatewayName || "Custom MCP Gateway"}</h3>;
}

function GatewayDescription() {
  if (import.meta.env.DEV) reportRender("GatewayDescription");
  const taskDescription = useTaskProfileField("description");
  return <p className={styles.description}>{taskDescription || "No task description yet."}</p>;
}

const Metrics = memo(function Metrics() {
  if (import.meta.env.DEV) reportRender("Metrics");

  return (
    <div className={styles.metrics}>
      <Metric kind="servers" label="Servers" />
      <Metric kind="tools" label="Selected tools" />
    </div>
  );
});

const Metric = memo(function Metric({ kind, label }: { kind: "servers" | "tools"; label: string }) {
  if (import.meta.env.DEV) reportRender(`Metric:${kind}`);
  const value = useCompositionSelector((current) =>
    kind === "servers" ? current.serverCount : current.selectedToolCount
  );

  const Icon = kind === "servers" ? Server : Wrench;
  return (
    <div className={styles.metric}>
      <div className={styles.metricIcon}>
        <Icon size="1rem" />
      </div>
      <p className={styles.metricLabel}>{label}</p>
      <p className={styles.metricValue}>{value}</p>
    </div>
  );
});

const RiskBreakdown = memo(function RiskBreakdown() {
  if (import.meta.env.DEV) reportRender("RiskBreakdown");

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>
        <Layers3 size="1rem" className={styles.accentIcon} />
        Risk breakdown
      </div>
      <div className={styles.risks}>
        <RiskRow label="read" />
        <RiskRow label="write" />
        <RiskRow label="external" />
        <RiskRow label="destructive" />
      </div>
    </div>
  );
});

const Warnings = memo(function Warnings() {
  if (import.meta.env.DEV) reportRender("Warnings");

  const isDescriptionMissing = useTaskDescriptionMissing();
  const conflictMessage = useCompositionSelector((current) => current.conflictMessage);
  const hasDestructiveTools = useCompositionSelector((current) => current.destructiveCount > 0);
  const hasServerErrors = useCompositionSelector((current) => current.hasServerErrors);
  const hasSelectedTools = useCompositionSelector((current) => current.selectedToolCount > 0);
  const hasWarnings =
    Boolean(conflictMessage) || hasDestructiveTools || hasServerErrors || isDescriptionMissing || !hasSelectedTools;

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>
        <AlertTriangle size="1rem" className={styles.warningIcon} />
        Warnings
      </div>
      {hasWarnings ? (
        <ul className={styles.warningList}>
          {conflictMessage && <Warning message={conflictMessage} />}
          {hasDestructiveTools && <Warning message="Destructive tools are enabled." />}
          {hasServerErrors && <Warning message="One or more servers report an error status." />}
          {isDescriptionMissing && <Warning message="Task description is missing." />}
          {!hasSelectedTools && <Warning message="No tools selected yet." />}
        </ul>
      ) : (
        <p className={styles.emptyWarnings}>No blocking composition warnings.</p>
      )}
    </div>
  );
});

const GenerateButton = memo(function GenerateButton() {
  if (import.meta.env.DEV) reportRender("GenerateButton");

  const hasSelectedTools = useCompositionSelector((current) => current.selectedToolCount > 0);
  const hasConflicts = useCompositionSelector((current) => current.conflicts.length > 0);
  const isGenerating = useCompositionSelector((current) => current.isGenerating);
  const canGenerate = hasSelectedTools && !hasConflicts;

  return (
    <Button
      variant="primary"
      fullWidth
      className={styles.generate}
      onClick={() => void compositionActions.generateGateway()}
      disabled={!canGenerate || isGenerating}
      leftIcon={<Sparkles size="1.0625rem" />}
    >
      {isGenerating ? "Generating..." : "Generate MCP Gateway"}
    </Button>
  );
});

const RiskRow = memo(function RiskRow({ label }: { label: "read" | "write" | "external" | "destructive" }) {
  if (import.meta.env.DEV) reportRender(`RiskRow:${label}`);
  const value = useCompositionSelector((current) => {
    if (label === "read") return current.readCount;
    if (label === "write") return current.writeCount;
    if (label === "external") return current.externalCount;
    return current.destructiveCount;
  });

  return (
    <div className={styles.riskRow}>
      <Badge tone={label}>{label}</Badge>
      <span className={styles.riskValue}>{value}</span>
    </div>
  );
});

function Warning({ message }: { message: string }) {
  return <li className={styles.warning}>{message}</li>;
}
