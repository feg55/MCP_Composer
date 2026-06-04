import { ListFilter, PlusCircle } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/utils";

export type ServerSetupTab = "catalog" | "manual";

interface ServerSetupTabsProps {
  activeTab: ServerSetupTab;
  onTabChange: (tab: ServerSetupTab) => void;
  catalog: ReactNode;
  manual: ReactNode;
}

const tabs = [
  {
    id: "catalog" as const,
    label: "Aggregator search",
    detail: "Search MCP registries",
    icon: ListFilter
  },
  {
    id: "manual" as const,
    label: "Manual server",
    detail: "Add custom stdio/http",
    icon: PlusCircle
  }
];

export function ServerSetupTabs({ activeTab, onTabChange, catalog, manual }: ServerSetupTabsProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#343d34] bg-[#191d19] p-2">
        <div className="grid gap-2 sm:grid-cols-2" role="tablist" aria-label="Server add mode">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  "flex items-center gap-3 rounded-md border px-4 py-3 text-left transition",
                  active ? "border-[#2bb3a3] bg-[#202620]" : "border-[#343d34] bg-[#111510] hover:bg-[#242a24]"
                )}
              >
                <Icon size={17} className={active ? "text-[#2bb3a3]" : "text-[#a9b4aa]"} />
                <span>
                  <span className="block text-[13px] font-semibold text-[#e7ece7]">{tab.label}</span>
                  <span className="block text-[12px] text-[#a9b4aa]">{tab.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div hidden={activeTab !== "catalog"}>{catalog}</div>
      <div hidden={activeTab !== "manual"}>{manual}</div>
    </div>
  );
}
