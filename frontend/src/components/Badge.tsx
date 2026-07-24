import type { RiskLevel, ServerStatus } from "../lib/types";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";

type BadgeTone = "neutral" | "read" | "write" | "external" | "destructive" | "ready" | "needs_auth" | "error" | "disabled";

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

const tones: Record<BadgeTone, string> = {
  neutral: "border-[#343d34] bg-[#202620] text-[#a9b4aa]",
  read: "border-[#2f6f45] bg-[#18331f] text-[#9ee7b1]",
  write: "border-[#8c6823] bg-[#342711] text-[#ffd48a]",
  external: "border-[#2c6f86] bg-[#142b34] text-[#9bdaf0]",
  destructive: "border-[#7b3030] bg-[#361717] text-[#ff9c9c]",
  ready: "border-[#2f6f45] bg-[#18331f] text-[#9ee7b1]",
  needs_auth: "border-[#8c6823] bg-[#342711] text-[#ffd48a]",
  error: "border-[#7b3030] bg-[#361717] text-[#ff9c9c]",
  disabled: "border-[#343d34] bg-[#161916] text-[#737d74]"
};

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2 text-[0.6875rem] font-semibold uppercase tracking-[0.02em]",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return <Badge tone={risk}>{risk}</Badge>;
}

export function StatusBadge({ status }: { status: ServerStatus }) {
  return <Badge tone={status}>{status.replace("_", " ")}</Badge>;
}
