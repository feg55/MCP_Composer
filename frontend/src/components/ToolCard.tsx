import { ChevronDown, ChevronRight } from "lucide-react";
import { type MouseEvent, useState } from "react";

import { RiskBadge } from "./Badge";
import type { McpToolDefinition, PermissionMode } from "../lib/types";
import { cn, formatJson } from "../lib/utils";

interface ToolCardProps {
  tool: McpToolDefinition;
  namespacePreview: string;
  aliasConflict: boolean;
  onToggle: (toolId: string, enabled: boolean) => void;
  onAliasChange: (toolId: string, alias: string) => void;
  onPermissionChange: (toolId: string, permission: PermissionMode) => void;
}

const inputClass =
  "h-9 w-full rounded-md border border-[#343d34] bg-[#111510] px-2.5 text-[13px] text-[#e7ece7] placeholder:text-[#6f7a70]";

export function ToolCard({ tool, namespacePreview, aliasConflict, onToggle, onAliasChange, onPermissionChange }: ToolCardProps) {
  const [schemaOpen, setSchemaOpen] = useState(false);

  function handleCardClick(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button,input,select,textarea,label,a,[data-no-card-toggle]")) return;
    onToggle(tool.id, !tool.enabled);
  }

  return (
    <article
      onClick={handleCardClick}
      className={cn(
        "cursor-pointer rounded-lg border bg-[#202620] p-4 transition hover:-translate-y-px hover:bg-[#242a24]",
        tool.enabled ? "border-[#2bb3a3]" : "border-[#343d34]"
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-3">
          <label className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center">
            <span className="sr-only">Enable {tool.originalName}</span>
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-[#343d34] accent-[#2bb3a3]"
              checked={tool.enabled}
              onChange={(event) => onToggle(tool.id, event.target.checked)}
            />
          </label>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-mono text-[14px] font-semibold text-[#e7ece7]">{tool.originalName}</h4>
              <RiskBadge risk={tool.riskLevel} />
            </div>
            <p className="mt-2 text-[13px] leading-5 text-[#a9b4aa]">{tool.description}</p>
            <p className="mt-2 font-mono text-[12px] text-[#7edbd0]">{namespacePreview}</p>
          </div>
        </div>
        <div className="grid gap-3 md:w-[360px]">
          <label className="space-y-1">
            <span className="text-[12px] font-semibold text-[#a9b4aa]">Exposed alias</span>
            <input
              className={cn(inputClass, aliasConflict && "border-[#ff7777]")}
              value={tool.exposedName}
              onChange={(event) => onAliasChange(tool.id, event.target.value)}
              aria-invalid={aliasConflict}
            />
            {aliasConflict && <span className="block text-[12px] text-[#ff9c9c]">Alias must be unique.</span>}
          </label>
          <label className="space-y-1">
            <span className="text-[12px] font-semibold text-[#a9b4aa]">Permission mode</span>
            <select
              className={inputClass}
              value={tool.permission}
              onChange={(event) => onPermissionChange(tool.id, event.target.value as PermissionMode)}
            >
              <option value="auto">auto</option>
              <option value="require_approval">require approval</option>
              <option value="disabled">disabled</option>
            </select>
          </label>
        </div>
      </div>

      <button
        type="button"
        className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[#a9b4aa] hover:text-[#e7ece7]"
        onClick={() => setSchemaOpen((current) => !current)}
      >
        {schemaOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Input schema preview
      </button>
      {schemaOpen && (
        <pre
          data-no-card-toggle
          className="scrollbar-thin mt-3 max-h-56 min-w-0 cursor-text overflow-auto rounded-md border border-[#343d34] bg-[#111510] p-3 text-[12px] leading-5 text-[#cdd6cd]"
        >
          {formatJson(tool.inputSchema)}
        </pre>
      )}
    </article>
  );
}
