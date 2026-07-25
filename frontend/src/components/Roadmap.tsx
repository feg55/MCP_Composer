import { Map } from "lucide-react";
import { memo } from "react";

import { Panel } from "./Panel";
import { reportRender } from "../lib/renderAudit";
import styles from "./Roadmap.module.scss";

const items = [
  "Connector health monitoring",
  "OAuth/secrets vault",
  "Hosted gateway URL",
  "Docker sandbox for stdio servers",
  "Team workspaces",
  "Registry publishing"
];

export const Roadmap = memo(function Roadmap() {
  if (import.meta.env.DEV) reportRender("Roadmap");

  return (
    <Panel title="Roadmap" subtitle="Next steps for production operations.">
      <div className={styles.grid}>
        {items.map((item) => (
          <div key={item} className={styles.item}>
            <Map size="0.9375rem" className={styles.icon} />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
});
