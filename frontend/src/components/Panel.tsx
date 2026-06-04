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
    <section className={cn("min-w-0 overflow-hidden rounded-lg border border-[#343d34] bg-[#191d19] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.18)]", className)}>
      {(title || subtitle || actions) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-[18px] font-semibold leading-6 text-[#e7ece7]">{title}</h2>}
            {subtitle && <p className="mt-1 text-[13px] leading-5 text-[#a9b4aa]">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
