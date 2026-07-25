import { Boxes, CheckCircle2, FileText, ServerCog, ServerCrash } from "lucide-react";
import { memo, type ReactNode } from "react";

import { API_BASE_URL } from "../lib/api";
import { useCompositionSelector } from "../lib/compositionStore";
import { reportRender } from "../lib/renderAudit";
import styles from "./AppShell.module.scss";

interface AppShellProps {
  children: ReactNode;
}

interface AppLayoutProps {
  children: ReactNode;
  sidebar: ReactNode;
}

const API_BASE_LABEL = API_BASE_URL || "same origin";

export function AppShell({ children }: AppShellProps) {
  if (import.meta.env.DEV) reportRender("AppShell");

  return (
    <div className={styles.shell}>
      <div className={styles.wrapper}>
        <AppHeader />
        {children}
      </div>
    </div>
  );
}

export function AppLayout({ children, sidebar }: AppLayoutProps) {
  if (import.meta.env.DEV) reportRender("AppLayout");

  return (
    <main className={styles.layout}>
      <div className={styles.content}>
        {children}
        <AppFooter />
      </div>
      <aside className={styles.sidebar}>{sidebar}</aside>
    </main>
  );
}

const AppHeader = memo(function AppHeader() {
  if (import.meta.env.DEV) reportRender("AppHeader");

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <div className={styles.logo}>
          <Boxes size="1.4375rem" aria-hidden="true" />
        </div>
        <div className={styles.brandCopy}>
          <h1 className={styles.title}>MCP Composer</h1>
          <p className={styles.tagline}>Build one task-specific MCP gateway from a curated upstream tool pool.</p>
        </div>
      </div>
      <div className={styles.connector}>
        <ServerCog size="1rem" className={styles.connectorIcon} aria-hidden="true" />
        Local MCP SDK connector
      </div>
    </header>
  );
});

const AppFooter = memo(function AppFooter() {
  if (import.meta.env.DEV) reportRender("AppFooter");

  return (
    <footer className={styles.footer}>
      <span className={styles.footerItem}>
        <CheckCircle2 size="0.875rem" className={styles.footerIcon} />
        Backend API base: {API_BASE_LABEL}
      </span>
      <span className={styles.footerItem}>
        <ServerCrash size="0.875rem" className={styles.footerIcon} />
        Real MCP SDK connector for upstream discovery and calls.
      </span>
      <span className={styles.footerItem}>
        <FileText size="0.875rem" className={styles.footerIcon} />
        Current output size: <OutputSize />
      </span>
    </footer>
  );
});

function OutputSize() {
  if (import.meta.env.DEV) reportRender("OutputSize");
  const outputSize = useCompositionSelector((current) => current.outputSize);
  return <>{outputSize} chars</>;
}
