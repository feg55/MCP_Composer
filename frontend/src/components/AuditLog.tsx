import { Activity, CheckCircle2, Info, TriangleAlert, XCircle } from "lucide-react";
import { memo } from "react";

import { useAuditLog } from "../lib/activityStore";
import { Panel } from "./Panel";
import { reportRender } from "../lib/renderAudit";
import type { AuditLogEntry, LogSeverity } from "../lib/types";
import { cn } from "../lib/utils";
import styles from "./AuditLog.module.scss";

const severityIcon: Record<LogSeverity, typeof Info> = {
  info: Info,
  warning: TriangleAlert,
  error: XCircle,
  success: CheckCircle2
};

const severityClass: Record<LogSeverity, string> = {
  info: styles.info,
  warning: styles.warning,
  error: styles.error,
  success: styles.success
};

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});

export const AuditLog = memo(function AuditLog() {
  if (import.meta.env.DEV) reportRender("AuditLog");
  const entries = useAuditLog();

  return (
    <Panel title="Activity / Audit Log" subtitle="Local action trail for the builder session.">
      {entries.length ? (
        <div className={styles.entries}>
          {entries.map((entry) => (
            <AuditLogRow key={entry.id} entry={entry} />
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>
            <Activity size="1rem" className={styles.activityIcon} />
            No activity yet
          </div>
          Important builder actions will be recorded here.
        </div>
      )}
    </Panel>
  );
});

const AuditLogRow = memo(function AuditLogRow({ entry }: { entry: AuditLogEntry }) {
  if (import.meta.env.DEV) reportRender(`AuditLogRow:${entry.id}`);

  const Icon = severityIcon[entry.severity];

  return (
    <article className={styles.entry}>
      <Icon size="1rem" className={cn(styles.severityIcon, severityClass[entry.severity])} />
      <div className={styles.entryContent}>
        <div className={styles.meta}>
          <span className={styles.type}>{entry.type}</span>
          <time className={styles.time} dateTime={entry.timestamp}>
            {timeFormatter.format(new Date(entry.timestamp))}
          </time>
        </div>
        <p className={styles.message}>{entry.message}</p>
      </div>
    </article>
  );
});
