import type { RiskLevel, ServerStatus } from "../lib/types";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import styles from "./Badge.module.scss";

type BadgeTone =
  "neutral" | "read" | "write" | "external" | "destructive" | "ready" | "needs_auth" | "error" | "disabled";

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

const tones: Record<BadgeTone, string> = {
  neutral: styles.neutral,
  read: styles.read,
  write: styles.write,
  external: styles.external,
  destructive: styles.destructive,
  ready: styles.ready,
  needs_auth: styles.needsAuth,
  error: styles.error,
  disabled: styles.disabled
};

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return <span className={cn(styles.badge, tones[tone], className)}>{children}</span>;
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return <Badge tone={risk}>{risk}</Badge>;
}

export function StatusBadge({ status }: { status: ServerStatus }) {
  return <Badge tone={status}>{status.replace("_", " ")}</Badge>;
}
