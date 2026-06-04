import { AlertTriangle, Layers3, Server, Sparkles, Wrench } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "./Badge";
import { Button } from "./Button";
import { Panel } from "./Panel";
import type { McpServerDefinition, McpToolDefinition, TaskProfile } from "../lib/types";
import { aliasConflicts, riskCounts } from "../lib/utils";

interface GatewaySummaryProps {
  taskProfile: TaskProfile;
  servers: McpServerDefinition[];
  selectedTools: McpToolDefinition[];
  warnings: string[];
  isGenerating: boolean;
  onGenerate: () => void;
}

export function GatewaySummary({ taskProfile, servers, selectedTools, warnings, isGenerating, onGenerate }: GatewaySummaryProps) {
  const counts = riskCounts(selectedTools);
  const conflicts = aliasConflicts(selectedTools);
  const canGenerate = selectedTools.length > 0 && conflicts.length === 0;

  return (
    <Panel className="space-y-4" title="Gateway Summary" subtitle="Live composition readiness and risk overview.">
      <div className="rounded-lg border border-[#343d34] bg-[#202620] p-4">
        <p className="text-[12px] font-semibold uppercase text-[#a9b4aa]">Output MCP</p>
        <h3 className="mt-1 text-[20px] font-semibold text-[#e7ece7]">{taskProfile.name || "Custom MCP Gateway"}</h3>
        <p className="mt-2 line-clamp-3 text-[13px] leading-5 text-[#a9b4aa]">
          {taskProfile.description || "No task description yet."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Metric icon={<Server size={16} />} label="Servers" value={servers.length.toString()} />
        <Metric icon={<Wrench size={16} />} label="Selected tools" value={selectedTools.length.toString()} />
      </div>

      <div className="rounded-lg border border-[#343d34] bg-[#202620] p-4">
        <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[#e7ece7]">
          <Layers3 size={16} className="text-[#2bb3a3]" />
          Risk breakdown
        </div>
        <div className="grid grid-cols-2 gap-2">
          <RiskRow label="read" value={counts.read} />
          <RiskRow label="write" value={counts.write} />
          <RiskRow label="external" value={counts.external} />
          <RiskRow label="destructive" value={counts.destructive} />
        </div>
      </div>

      <div className="rounded-lg border border-[#343d34] bg-[#202620] p-4">
        <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[#e7ece7]">
          <AlertTriangle size={16} className="text-[#ffd48a]" />
          Warnings
        </div>
        {warnings.length ? (
          <ul className="space-y-2">
            {warnings.map((warning) => (
              <li key={warning} className="rounded-md border border-[#4a4028] bg-[#2b2414] px-3 py-2 text-[12px] leading-5 text-[#ffd48a]">
                {warning}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-[#a9b4aa]">No blocking composition warnings.</p>
        )}
      </div>

      <Button
        variant="primary"
        fullWidth
        className="h-11"
        onClick={onGenerate}
        disabled={!canGenerate || isGenerating}
        leftIcon={<Sparkles size={17} />}
      >
        {isGenerating ? "Generating..." : "Generate MCP Gateway"}
      </Button>
    </Panel>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#343d34] bg-[#202620] p-4">
      <div className="flex items-center gap-2 text-[#2bb3a3]">{icon}</div>
      <p className="mt-3 text-[12px] font-semibold uppercase text-[#a9b4aa]">{label}</p>
      <p className="text-[24px] font-semibold text-[#e7ece7]">{value}</p>
    </div>
  );
}

function RiskRow({ label, value }: { label: "read" | "write" | "external" | "destructive"; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-[#343d34] bg-[#111510] px-2 py-2">
      <Badge tone={label}>{label}</Badge>
      <span className="text-[13px] font-semibold text-[#e7ece7]">{value}</span>
    </div>
  );
}
