import { ListFilter, PlusCircle } from "lucide-react";
import { memo, type KeyboardEvent, useCallback, useState } from "react";

import { reportRender } from "../lib/renderAudit";
import { cn } from "../lib/utils";
import { ManualServerForm } from "./ManualServerForm";
import { ServerDiscovery } from "./ServerDiscovery";
import styles from "./ServerSetupTabs.module.scss";

type ServerSetupTab = "catalog" | "manual";

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

export const ServerSetupTabs = memo(function ServerSetupTabs() {
  if (import.meta.env.DEV) reportRender("ServerSetupTabs");

  const [activeTab, setActiveTab] = useState<ServerSetupTab>("catalog");

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab.id);
    document.getElementById(`server-tab-${nextTab.id}`)?.focus();
  }, []);

  return (
    <div className={styles.root}>
      <div className={styles.tabPanel}>
        <div className={styles.tabList} role="tablist" aria-label="Server add mode" aria-orientation="horizontal">
          {tabs.map((tab, index) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`server-tab-${tab.id}`}
                aria-controls={`server-panel-${tab.id}`}
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => {
                  if (!active) setActiveTab(tab.id);
                }}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={cn(styles.tab, active && styles.activeTab)}
              >
                <Icon size="1.0625rem" className={active ? styles.activeIcon : styles.icon} />
                <span>
                  <span className={styles.label}>{tab.label}</span>
                  <span className={styles.detail}>{tab.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "catalog" ? (
        <div id="server-panel-catalog" role="tabpanel" aria-labelledby="server-tab-catalog">
          <ServerDiscovery />
        </div>
      ) : (
        <div id="server-panel-manual" role="tabpanel" aria-labelledby="server-tab-manual">
          <ManualServerForm />
        </div>
      )}
    </div>
  );
});
