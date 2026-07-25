import { Filter, Plus, RefreshCw, Search } from "lucide-react";
import { memo, type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, API_BASE_URL } from "../lib/api";
import { compositionActions, useCompositionSelector } from "../lib/compositionStore";
import { reportRender } from "../lib/renderAudit";
import type { CatalogServerDefinition, CatalogSourceStatus, McpTransport, RiskLevel } from "../lib/types";
import { cn } from "../lib/utils";
import { Badge, RiskBadge, StatusBadge } from "./Badge";
import { Button } from "./Button";
import { Panel } from "./Panel";
import styles from "./ServerDiscovery.module.scss";

interface CatalogCardProps {
  server: CatalogServerDefinition;
}

const API_BASE_LABEL = API_BASE_URL || "same origin";

function mergeCatalogServers(
  current: CatalogServerDefinition[],
  next: CatalogServerDefinition[]
): CatalogServerDefinition[] {
  const byId = new Map(current.map((server) => [server.id, server]));
  next.forEach((server) => byId.set(server.id, server));
  return Array.from(byId.values());
}

const CatalogCard = memo(function CatalogCard({ server }: CatalogCardProps) {
  if (import.meta.env.DEV) reportRender(`CatalogCard:${server.id}`);

  const isAdded = useCompositionSelector((current) => current.serverById.has(server.id));
  const discoveredRisks = useMemo(
    () => Array.from(new Set(server.tools.map((tool) => tool.riskLevel))),
    [server.tools]
  );
  const canAdd = Boolean(server.command || server.url);
  const handleAdd = useCallback(() => compositionActions.addServer(server), [server]);

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardBody}>
          <div className={styles.titleRow}>
            <h3 className={styles.cardTitle}>{server.name}</h3>
            <Badge>{server.transport}</Badge>
            <StatusBadge status={server.status} />
            {server.verified && <Badge tone="read">verified</Badge>}
          </div>
          <p className={styles.description}>{server.description}</p>
          {(server.packageId || server.remoteUrl || server.repositoryUrl) && (
            <p className={styles.packageId}>{server.packageId || server.remoteUrl || server.repositoryUrl}</p>
          )}
        </div>
        <Button
          variant={isAdded || !canAdd ? "ghost" : "primary"}
          onClick={handleAdd}
          disabled={isAdded || !canAdd}
          leftIcon={<Plus size="0.9375rem" />}
        >
          {isAdded ? "Added" : canAdd ? "Add" : "Metadata"}
        </Button>
      </div>
      <div className={styles.badgeRow}>
        <Badge>
          {server.tools.length ? `${server.tools.length} tools` : canAdd ? "discover tools after add" : "metadata only"}
        </Badge>
        {discoveredRisks.map((item) => (
          <RiskBadge key={item} risk={item} />
        ))}
        {typeof server.popularity === "number" && <Badge>{server.popularity.toLocaleString()} uses</Badge>}
      </div>
      <div className={styles.tagRow}>
        {(server.catalogSources ?? []).map((item) => (
          <span key={`${server.id}-${item}`} className={styles.sourceTag}>
            {item}
          </span>
        ))}
        {server.tags.map((item) => (
          <span key={item} className={styles.tag}>
            {item}
          </span>
        ))}
      </div>
    </article>
  );
});

export const ServerDiscovery = memo(function ServerDiscovery() {
  if (import.meta.env.DEV) reportRender("ServerDiscovery");

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);
  const loadedQueryRef = useRef<string | null>(null);
  const automaticQueryRef = useRef<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogServerDefinition[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogLoadingMore, setCatalogLoadingMore] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogCursor, setCatalogCursor] = useState<string | null>(null);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogSources, setCatalogSources] = useState<CatalogSourceStatus[]>([]);
  const [tag, setTag] = useState("all");
  const [transport, setTransport] = useState<"all" | McpTransport>("all");
  const [risk, setRisk] = useState<"all" | RiskLevel>("all");

  const fetchCatalog = useCallback(async (query: string) => {
    const requestId = ++requestIdRef.current;
    setCatalogLoading(true);
    setCatalogLoadingMore(false);
    setCatalogError(null);
    try {
      const data = await api.searchCatalog({ query, limit: 30 });
      if (requestId !== requestIdRef.current) return;
      setCatalog(data.servers);
      setCatalogCursor(data.nextCursor);
      setCatalogSources(data.sources);
      loadedQueryRef.current = query;
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      const message = error instanceof Error ? error.message : "Failed to load catalog.";
      setCatalogError(`Catalog request failed from ${API_BASE_LABEL}: ${message}`);
    } finally {
      if (requestId === requestIdRef.current) setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (automaticQueryRef.current === catalogQuery) return;
    automaticQueryRef.current = catalogQuery;
    void fetchCatalog(catalogQuery);
  }, [catalogQuery, fetchCatalog]);

  const loadMoreCatalog = useCallback(async () => {
    if (!catalogCursor || catalogLoading || catalogLoadingMore || catalogQuery !== loadedQueryRef.current) {
      return;
    }

    const requestId = requestIdRef.current;
    setCatalogLoadingMore(true);
    setCatalogError(null);
    try {
      const data = await api.searchCatalog({
        query: catalogQuery,
        cursor: catalogCursor,
        limit: 30
      });
      if (requestId !== requestIdRef.current) return;
      setCatalog((current) => mergeCatalogServers(current, data.servers));
      setCatalogCursor(data.nextCursor);
      setCatalogSources(data.sources);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      const message = error instanceof Error ? error.message : "Failed to load catalog.";
      setCatalogError(`Catalog request failed from ${API_BASE_LABEL}: ${message}`);
    } finally {
      if (requestId === requestIdRef.current) setCatalogLoadingMore(false);
    }
  }, [catalogCursor, catalogLoading, catalogLoadingMore, catalogQuery]);

  const hasLoadedCatalog = loadedQueryRef.current !== null;
  const tags = useMemo(() => Array.from(new Set(catalog.flatMap((server) => server.tags))).sort(), [catalog]);
  const filtered = useMemo(() => {
    const normalizedQuery = catalogQuery.trim().toLowerCase();
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
  }, [catalog, catalogQuery, risk, tag, transport]);

  const handleTagChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => setTag(event.target.value), []);
  const handleTransportChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => setTransport(event.target.value as "all" | McpTransport),
    []
  );
  const handleRiskChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => setRisk(event.target.value as "all" | RiskLevel),
    []
  );
  const handleRetry = useCallback(() => {
    void fetchCatalog(catalogQuery);
  }, [catalogQuery, fetchCatalog]);
  const handleLoadMore = useCallback(() => {
    void loadMoreCatalog();
  }, [loadMoreCatalog]);

  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || !catalogCursor || catalogLoading || catalogLoadingMore) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) handleLoadMore();
      },
      { rootMargin: "420px 0px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [catalogLoading, catalogLoadingMore, catalogCursor, filtered.length, handleLoadMore]);

  return (
    <Panel
      title="Discover MCP Servers"
      subtitle="Search MCP aggregators and add runnable upstream configs to the shared pool."
    >
      <div className={styles.filters}>
        <CatalogSearchInput onCommit={setCatalogQuery} />
        <label>
          <span className={styles.visuallyHidden}>Filter by tag</span>
          <select className={styles.input} value={tag} onChange={handleTagChange}>
            <option value="all">All tags</option>
            {tags.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={styles.visuallyHidden}>Filter by transport</span>
          <select className={styles.input} value={transport} onChange={handleTransportChange}>
            <option value="all">All transports</option>
            <option value="stdio">stdio</option>
            <option value="http">http</option>
          </select>
        </label>
        <label>
          <span className={styles.visuallyHidden}>Filter by risk</span>
          <select className={styles.input} value={risk} onChange={handleRiskChange}>
            <option value="all">All risk</option>
            <option value="read">read</option>
            <option value="write">write</option>
            <option value="external">external</option>
            <option value="destructive">destructive</option>
          </select>
        </label>
      </div>

      <div className={styles.sourceStatuses}>
        {catalogSources.length ? (
          catalogSources.map((source) => (
            <span
              key={source.id}
              className={cn(
                styles.sourceStatus,
                !source.enabled && styles.sourceDisabled,
                source.enabled && source.ok && styles.sourceSynced,
                source.enabled && !source.ok && styles.sourceError
              )}
              title={source.message ?? undefined}
            >
              {source.label}
              {!source.enabled ? " disabled" : source.ok ? " synced" : " error"}
            </span>
          ))
        ) : (
          <span className={cn(styles.sourceStatus, styles.sourceUnknown)}>
            aggregator status appears after the first search
          </span>
        )}
      </div>

      {catalogError && (
        <div className={styles.errorBanner}>
          <span>{catalogError}</span>
          <Button variant="secondary" onClick={handleRetry} leftIcon={<RefreshCw size="0.9375rem" />}>
            Retry
          </Button>
        </div>
      )}

      {catalogLoading && !hasLoadedCatalog ? (
        <div className={styles.loading}>Loading MCP catalog...</div>
      ) : (
        <div className={styles.catalogGrid} aria-busy={catalogLoading}>
          {filtered.map((server) => (
            <CatalogCard key={server.id} server={server} />
          ))}
        </div>
      )}

      {catalogLoading && hasLoadedCatalog && (
        <div className={styles.loading} role="status">
          Refreshing MCP catalog...
        </div>
      )}

      {!catalogLoading && hasLoadedCatalog && filtered.length > 0 && (
        <div ref={sentinelRef} className={styles.pagination}>
          {catalogCursor ? (
            <Button
              variant="secondary"
              onClick={handleLoadMore}
              disabled={catalogLoadingMore}
              leftIcon={<RefreshCw size="0.9375rem" />}
            >
              {catalogLoadingMore ? "Loading..." : "Load more servers"}
            </Button>
          ) : (
            <span className={styles.endMessage}>End of loaded catalog results</span>
          )}
        </div>
      )}

      {!catalogLoading && hasLoadedCatalog && !filtered.length && (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>
            <Filter size="1rem" className={styles.emptyIcon} />
            No matching servers
          </div>
          Adjust search, tag, transport, or risk filters to widen the template view.
        </div>
      )}
    </Panel>
  );
});

const CatalogSearchInput = memo(function CatalogSearchInput({ onCommit }: { onCommit: (query: string) => void }) {
  if (import.meta.env.DEV) reportRender("CatalogSearchInput");

  const [draftQuery, setDraftQuery] = useState("");
  const commitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
    };
  }, []);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const query = event.target.value;
      setDraftQuery(query);
      if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = window.setTimeout(() => {
        commitTimerRef.current = null;
        onCommit(query);
      }, 260);
    },
    [onCommit]
  );

  return (
    <label className={styles.searchField}>
      <span className={styles.visuallyHidden}>Search servers</span>
      <Search className={styles.searchIcon} size="1rem" />
      <input
        className={cn(styles.input, styles.searchInput)}
        value={draftQuery}
        onChange={handleChange}
        placeholder="Search official registry, Glama, Smithery, PulseMCP..."
      />
    </label>
  );
});
