import type { PropsWithChildren } from "react";
import { AuthControls } from "./auth-controls";
import { HeaderNav } from "./header-nav";

export function AppShell({ children, clerkEnabled }: PropsWithChildren<{ clerkEnabled?: boolean }>) {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-5 md:px-8">
      <header className="glass mb-6 flex items-center justify-between rounded-[32px] px-6 py-4">
        <div>
          <p className="font-display text-2xl font-semibold tracking-tight">CostPilot AI</p>
          <p className="text-sm text-slate-600">Governance, billing, and observability for every LLM call</p>
        </div>
        <HeaderNav />
        <AuthControls enabled={Boolean(clerkEnabled)} />
      </header>
      {children}
    </div>
  );
}
