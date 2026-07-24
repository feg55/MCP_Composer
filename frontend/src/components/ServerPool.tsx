import { PlayCircle, Power, RefreshCw, Trash2 } from "lucide-react";

import { Badge, StatusBadge } from "./Badge";
import { Button } from "./Button";
import { Panel } from "./Panel";
import type { McpServerDefinition } from "../lib/types";

interface ServerPoolProps {
  servers: McpServerDefinition[];
  testingServerId: string | null;
  discoveringServerId: string | null;
  onToggleDisabled: (serverId: string) => void;
  onInspect: (serverId: string) => void;
  onTest: (server: McpServerDefinition) => void;
  onRemove: (serverId: string) => void;
}

export function ServerPool({
  servers,
  testingServerId,
  discoveringServerId,
  onToggleDisabled,
  onInspect,
  onTest,
  onRemove
}: ServerPoolProps) {
  return (
    <Panel title="Server Pool" subtitle="Upstream servers added to the composition workspace.">
      {servers.length ? (
        <div className="space-y-3">
          {servers.map((server) => {
            const selectedCount = server.tools.filter((tool) => tool.enabled).length;
            const isDisabled = server.status === "disabled";
            return (
              <article key={server.id} className="rounded-lg border border-[#343d34] bg-[#202620] p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words text-[0.9375rem] font-semibold text-[#e7ece7]">{server.name}</h3>
                      <Badge>{server.transport}</Badge>
                      <StatusBadge status={server.status} />
                    </div>
                    <p className="mt-2 text-[0.8125rem] leading-5 text-[#a9b4aa]">{server.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[0.75rem] text-[#a9b4aa]">
                      <span className="rounded-md border border-[#343d34] px-2 py-1">
                        {selectedCount}/{server.tools.length} tools selected
                      </span>
                      {!server.tools.length && (
                        <span className="rounded-md border border-[#5f4c26] bg-[#2c2413] px-2 py-1 text-[#f3cc7a]">
                          discovery required
                        </span>
                      )}
                      <span className="rounded-md border border-[#343d34] px-2 py-1">{server.source}</span>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
                    <Button variant="secondary" onClick={() => onToggleDisabled(server.id)} leftIcon={<Power size="0.9375rem" />}>
                      {isDisabled ? "Enable" : "Disable"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => onInspect(server.id)}
                      disabled={discoveringServerId === server.id || isDisabled}
                      leftIcon={<RefreshCw size="0.9375rem" />}
                    >
                      {discoveringServerId === server.id ? "Discovering" : server.tools.length ? "Refresh tools" : "Discover tools"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => onTest(server)}
                      disabled={testingServerId === server.id}
                      leftIcon={<PlayCircle size="0.9375rem" />}
                    >
                      {testingServerId === server.id ? "Testing" : "Test"}
                    </Button>
                    <Button variant="danger" onClick={() => onRemove(server.id)} leftIcon={<Trash2 size="0.9375rem" />}>
                      Remove
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-[#343d34] bg-[#111510] p-5 text-[0.8125rem] leading-5 text-[#a9b4aa]">
          Add a server from discovery or manual configuration to start composing a gateway.
        </div>
      )}
    </Panel>
  );
}
