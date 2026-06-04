import type { ReactNode } from "react";
import { Boxes, ServerCog } from "lucide-react";

interface AppShellProps {
  children: ReactNode;
  sidebar: ReactNode;
}

export function AppShell({ children, sidebar }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[#10120f] px-4 py-6 text-[#e7ece7] md:px-6">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-6 flex flex-col gap-4 border-b border-[#343d34] pb-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#343d34] bg-[#191d19] text-[#2bb3a3]">
              <Boxes size={23} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-[34px] font-semibold leading-10 tracking-normal text-[#e7ece7]">MCP Composer</h1>
              <p className="mt-1 text-[13px] text-[#a9b4aa]">
                Build one task-specific MCP gateway from a curated upstream tool pool.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-[#343d34] bg-[#191d19] px-3 py-2 text-[13px] text-[#a9b4aa]">
            <ServerCog size={16} className="text-[#2bb3a3]" aria-hidden="true" />
            Local MCP SDK connector
          </div>
        </header>

        <main className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
          <div className="min-w-0 space-y-6">{children}</div>
          <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">{sidebar}</aside>
        </main>
      </div>
    </div>
  );
}
