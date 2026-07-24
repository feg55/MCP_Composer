import { Filter, Plus, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge, RiskBadge, StatusBadge } from "./Badge";
import { Button } from "./Button";
import { Panel } from "./Panel";
import type { CatalogServerDefinition, CatalogSourceStatus, McpTransport, RiskLevel } from "../lib/types";
import { cn } from "../lib/utils";

interface ServerDiscoveryProps {
  catalog: CatalogServerDefinition[];
  poolIds: string[];
  query: string;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  sources: CatalogSourceStatus[];
  onQueryChange: (query: string) => void;
  onAdd: (server: CatalogServerDefinition) => void;
  onRetry: () => void;
  onLoadMore: () => void;
}

const inputClass =
  "h-10 w-full rounded-md border border-[#343d34] bg-[#111510] px-3 text-[0.8125rem] text-[#e7ece7] placeholder:text-[#6f7a70]";

export function ServerDiscovery({
  catalog,
  poolIds,
  query,
  isLoading,
  isLoadingMore,
  hasMore,
  error,
  sources,
  onQueryChange,
  onAdd,
  onRetry,
  onLoadMore
}: ServerDiscoveryProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [tag, setTag] = useState("all");
  const [transport, setTransport] = useState<"all" | McpTransport>("all");
  const [risk, setRisk] = useState<"all" | RiskLevel>("all");

  const tags = useMemo(() => {
    return Array.from(new Set(catalog.flatMap((server) => server.tags))).sort();
  }, [catalog]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return catalog.filter((server) => {
      const matchesText =
        !normalizedQuery ||
        [server.name, server.description, server.transport, server.source, ...server.tags]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesTag = tag === "all" || server.tags.includes(tag);
      const matchesTransport = transport === "all" || server.transport === transport;
      const matchesRisk = risk === "all" || server.tools.some((tool) => tool.riskLevel === risk);
      return matchesText && matchesTag && matchesTransport && matchesRisk;
    });
  }, [catalog, query, risk, tag, transport]);

  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || !hasMore || isLoading || isLoadingMore) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: "420px 0px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, isLoading, isLoadingMore, onLoadMore]);

  return (
    <Panel title="Discover MCP Servers" subtitle="Search MCP aggregators and add runnable upstream configs to the shared pool.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_10rem_9.375rem_9.375rem]">
        <label className="relative block">
          <span className="sr-only">Search servers</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6f7a70]" size="1rem" />
          <input
            className={cn(inputClass, "pl-9")}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search official registry, Glama, Smithery, PulseMCP..."
          />
        </label>
        <label>
          <span className="sr-only">Filter by tag</span>
          <select className={inputClass} value={tag} onChange={(event) => setTag(event.target.value)}>
            <option value="all">All tags</option>
            {tags.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by transport</span>
          <select
            className={inputClass}
            value={transport}
            onChange={(event) => setTransport(event.target.value as "all" | McpTransport)}
          >
            <option value="all">All transports</option>
            <option value="stdio">stdio</option>
            <option value="http">http</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by risk</span>
          <select className={inputClass} value={risk} onChange={(event) => setRisk(event.target.value as "all" | RiskLevel)}>
            <option value="all">All risk</option>
            <option value="read">read</option>
            <option value="write">write</option>
            <option value="external">external</option>
            <option value="destructive">destructive</option>
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {sources.length ? (
          sources.map((source) => (
            <span
              key={source.id}
              className={cn(
                "rounded-full border px-2 py-1 text-[0.6875rem]",
                !source.enabled && "border-[#4a4028] bg-[#2b2414] text-[#ffd48a]",
                source.enabled && source.ok && "border-[#2f6f45] bg-[#18331f] text-[#9ee7b1]",
                source.enabled && !source.ok && "border-[#7b3030] bg-[#361717] text-[#ffb3b3]"
              )}
              title={source.message ?? undefined}
            >
              {source.label}
              {!source.enabled ? " disabled" : source.ok ? " synced" : " error"}
            </span>
          ))
        ) : (
          <span className="rounded-full border border-[#343d34] px-2 py-1 text-[0.6875rem] text-[#a9b4aa]">
            aggregator status appears after the first search
          </span>
        )}
      </div>

      {error && (
        <div className="mt-4 flex flex-col gap-3 rounded-md border border-[#7b3030] bg-[#361717] p-4 text-[0.8125rem] text-[#ffb3b3] md:flex-row md:items-center md:justify-between">
          <span>{error}</span>
          <Button variant="secondary" onClick={onRetry} leftIcon={<RefreshCw size="0.9375rem" />}>
            Retry
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="mt-4 rounded-md border border-[#343d34] bg-[#202620] p-5 text-[0.8125rem] text-[#a9b4aa]">
          Loading MCP catalog...
        </div>
      ) : (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {filtered.map((server) => {
            const isAdded = poolIds.includes(server.id);
            const discoveredRisks = Array.from(new Set(server.tools.map((tool) => tool.riskLevel)));
            const canAdd = Boolean(server.command || server.url);
            return (
              <article
                key={server.id}
                className="min-w-0 rounded-lg border border-[#343d34] bg-[#202620] p-4 transition hover:-translate-y-px hover:bg-[#242a24]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words text-[0.9375rem] font-semibold text-[#e7ece7]">{server.name}</h3>
                      <Badge>{server.transport}</Badge>
                      <StatusBadge status={server.status} />
                      {server.verified && <Badge tone="read">verified</Badge>}
                    </div>
                    <p className="mt-2 text-[0.8125rem] leading-5 text-[#a9b4aa]">{server.description}</p>
                    {(server.packageId || server.remoteUrl || server.repositoryUrl) && (
                      <p className="mt-2 truncate font-mono text-[0.75rem] text-[#7edbd0]">
                        {server.packageId || server.remoteUrl || server.repositoryUrl}
                      </p>
                    )}
                  </div>
                  <Button
                    variant={isAdded || !canAdd ? "ghost" : "primary"}
                    onClick={() => onAdd(server)}
                    disabled={isAdded || !canAdd}
                    leftIcon={<Plus size="0.9375rem" />}
                  >
                    {isAdded ? "Added" : canAdd ? "Add" : "Metadata"}
                  </Button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge>{server.tools.length ? `${server.tools.length} tools` : canAdd ? "discover tools after add" : "metadata only"}</Badge>
                  {discoveredRisks.map((item) => (
                    <RiskBadge key={item} risk={item} />
                  ))}
                  {typeof server.popularity === "number" && <Badge>{server.popularity.toLocaleString()} uses</Badge>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(server.catalogSources ?? []).map((item) => (
                    <span key={`${server.id}-${item}`} className="rounded-full border border-[#2f6f45] px-2 py-1 text-[0.6875rem] text-[#9ee7b1]">
                      {item}
                    </span>
                  ))}
                  {server.tags.map((item) => (
                    <span key={item} className="rounded-full border border-[#343d34] px-2 py-1 text-[0.6875rem] text-[#a9b4aa]">
                      {item}
                    </span>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div ref={sentinelRef} className="mt-4 flex justify-center">
          {hasMore ? (
            <Button variant="secondary" onClick={onLoadMore} disabled={isLoadingMore} leftIcon={<RefreshCw size="0.9375rem" />}>
              {isLoadingMore ? "Loading..." : "Load more servers"}
            </Button>
          ) : (
            <span className="rounded-md border border-[#343d34] bg-[#111510] px-3 py-2 text-[0.75rem] text-[#a9b4aa]">
              End of loaded catalog results
            </span>
          )}
        </div>
      )}

      {!isLoading && !filtered.length && (
        <div className="mt-4 rounded-md border border-dashed border-[#343d34] bg-[#111510] p-5 text-[0.8125rem] text-[#a9b4aa]">
          <div className="mb-2 flex items-center gap-2 text-[#e7ece7]">
            <Filter size="1rem" className="text-[#2bb3a3]" />
            No matching servers
          </div>
          Adjust search, tag, transport, or risk filters to widen the template view.
        </div>
      )}
    </Panel>
  );
}
