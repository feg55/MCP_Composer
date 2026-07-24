import { Map } from "lucide-react";

import { Panel } from "./Panel";

const items = [
  "Connector health monitoring",
  "OAuth/secrets vault",
  "Hosted gateway URL",
  "Docker sandbox for stdio servers",
  "Team workspaces",
  "Registry publishing"
];

export function Roadmap() {
  return (
    <Panel title="Roadmap" subtitle="Next steps for production operations.">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item} className="flex items-center gap-2 rounded-md border border-[#343d34] bg-[#202620] px-3 py-2 text-[0.8125rem] text-[#e7ece7]">
            <Map size="0.9375rem" className="shrink-0 text-[#2bb3a3]" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
