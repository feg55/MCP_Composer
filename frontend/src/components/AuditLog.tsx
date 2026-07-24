import { Activity, CheckCircle2, Info, TriangleAlert, XCircle } from "lucide-react";

import { Panel } from "./Panel";
import type { AuditLogEntry, LogSeverity } from "../lib/types";
import { cn, formatTimestamp } from "../lib/utils";

interface AuditLogProps {
  entries: AuditLogEntry[];
}

const severityIcon: Record<LogSeverity, typeof Info> = {
  info: Info,
  warning: TriangleAlert,
  error: XCircle,
  success: CheckCircle2
};

const severityClass: Record<LogSeverity, string> = {
  info: "text-[#9bdaf0]",
  warning: "text-[#ffd48a]",
  error: "text-[#ff9c9c]",
  success: "text-[#9ee7b1]"
};

export function AuditLog({ entries }: AuditLogProps) {
  return (
    <Panel title="Activity / Audit Log" subtitle="Local action trail for the builder session.">
      {entries.length ? (
        <div className="scrollbar-thin max-h-[22.5rem] space-y-2 overflow-auto pr-1">
          {entries.map((entry) => {
            const Icon = severityIcon[entry.severity];
            return (
              <article key={entry.id} className="grid grid-cols-[auto_1fr] gap-3 rounded-md border border-[#343d34] bg-[#202620] p-3">
                <Icon size="1rem" className={cn("mt-0.5", severityClass[entry.severity])} />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[0.6875rem] uppercase text-[#a9b4aa]">{entry.type}</span>
                    <span className="text-[0.6875rem] text-[#6f7a70]">{formatTimestamp(entry.timestamp)}</span>
                  </div>
                  <p className="mt-1 text-[0.8125rem] leading-5 text-[#e7ece7]">{entry.message}</p>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-[#343d34] bg-[#111510] p-5 text-[0.8125rem] leading-5 text-[#a9b4aa]">
          <div className="mb-2 flex items-center gap-2 text-[#e7ece7]">
            <Activity size="1rem" className="text-[#2bb3a3]" />
            No activity yet
          </div>
          Important builder actions will be recorded here.
        </div>
      )}
    </Panel>
  );
}

