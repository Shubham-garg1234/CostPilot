import type { PropsWithChildren } from "react";
import Link from "next/link";
import type { Route } from "next";
import { BarChart3, BellRing, Building2, Shield, WalletCards } from "lucide-react";
import { AuthControls } from "./auth-controls";

const navItems = [
  { href: "/", label: "Overview", icon: BarChart3 },
  { href: "/organization", label: "Organization", icon: Building2 },
  { href: "/policies", label: "Policies", icon: Shield },
  { href: "/alerts", label: "Alerts", icon: BellRing },
  { href: "/billing", label: "Billing", icon: WalletCards }
] as const satisfies ReadonlyArray<{ href: Route; label: string; icon: typeof BarChart3 }>;

export function AppShell({ children, clerkEnabled }: PropsWithChildren<{ clerkEnabled?: boolean }>) {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-5 md:px-8">
      <header className="glass mb-6 flex items-center justify-between rounded-[32px] px-6 py-4">
        <div>
          <p className="font-display text-2xl font-semibold tracking-tight">CostPilot AI</p>
          <p className="text-sm text-slate-600">Governance, billing, and observability for every LLM call</p>
        </div>
        <nav className="flex flex-wrap gap-2">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="rounded-full border border-black/10 bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:bg-white"
            >
              <span className="inline-flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {label}
              </span>
            </Link>
          ))}
        </nav>
        <AuthControls enabled={Boolean(clerkEnabled)} />
      </header>
      {children}
    </div>
  );
}
