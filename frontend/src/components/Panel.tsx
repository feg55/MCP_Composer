import type { ReactNode } from "react";

import { cn } from "../lib/utils";

interface PanelProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, subtitle, actions, children, className }: PanelProps) {
  return (
    <section className={cn("min-w-0 overflow-hidden rounded-lg border border-[#343d34] bg-[#191d19] p-5 shadow-[0_1.125rem_2.5rem_rgba(0,0,0,0.18)]", className)}>
      {(title || subtitle || actions) && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            {title && <h2 className="text-[1.125rem] font-semibold leading-6 text-[#e7ece7]">{title}</h2>}
            {subtitle && <p className="mt-1 text-[0.8125rem] leading-5 text-[#a9b4aa]">{subtitle}</p>}
          </div>
          {actions && <div className="shrink-0 self-start">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
