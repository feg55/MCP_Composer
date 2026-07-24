import type { ReactNode } from "react";
import { Boxes, ServerCog } from "lucide-react";

interface AppShellProps {
  children: ReactNode;
  sidebar: ReactNode;
}

export function AppShell({ children, sidebar }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[#10120f] px-4 py-4 text-[#e7ece7] sm:px-6 sm:py-6">
      <div className="mx-auto w-full max-w-[90rem]">
        <header className="mb-6 flex flex-col gap-4 border-b border-[#343d34] pb-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#343d34] bg-[#191d19] text-[#2bb3a3] sm:h-11 sm:w-11">
              <Boxes size="1.4375rem" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-[clamp(1.75rem,8vw,2.125rem)] font-semibold leading-tight tracking-normal text-[#e7ece7] sm:leading-10">
                MCP Composer
              </h1>
              <p className="mt-1 text-[0.8125rem] text-[#a9b4aa]">
                Build one task-specific MCP gateway from a curated upstream tool pool.
              </p>
            </div>
          </div>
          <div className="flex w-full items-center gap-2 rounded-md border border-[#343d34] bg-[#191d19] px-3 py-2 text-[0.8125rem] text-[#a9b4aa] sm:w-fit">
            <ServerCog size="1rem" className="text-[#2bb3a3]" aria-hidden="true" />
            Local MCP SDK connector
          </div>
        </header>

        <main className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_clamp(21.25rem,29vw,26.25rem)]">
          <div className="min-w-0 space-y-6">{children}</div>
          <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">{sidebar}</aside>
        </main>
      </div>
    </div>
  );
}
