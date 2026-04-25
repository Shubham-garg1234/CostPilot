"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { BarChart3, BellRing, Building2, Shield, WalletCards } from "lucide-react";

const organizationNavItems = [
  { href: "/organization", label: "Overview", icon: BarChart3 },
  { href: "/organization", label: "Organization", icon: Building2 },
  { href: "/policies", label: "Policies", icon: Shield },
  { href: "/alerts", label: "Alerts", icon: BellRing },
  { href: "/billing", label: "Billing", icon: WalletCards }
] as const satisfies ReadonlyArray<{ href: Route; label: string; icon: typeof BarChart3 }>;

function getWorkspace(pathname: string) {
  if (pathname.startsWith("/employee")) {
    return "employee";
  }

  if (
    pathname.startsWith("/organization") ||
    pathname.startsWith("/policies") ||
    pathname.startsWith("/alerts") ||
    pathname.startsWith("/billing")
  ) {
    return "organization";
  }

  return "public";
}

export function HeaderNav() {
  const pathname = usePathname();
  const workspace = getWorkspace(pathname);
  const navItems = workspace === "organization" ? organizationNavItems : [];

  if (navItems.length === 0) {
    return null;
  }

  return (
    <nav className="flex flex-wrap gap-2">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;

        return (
          <Link
            key={`${href}-${label}`}
            href={href}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5 ${
              active
                ? "border-black bg-black text-white"
                : "border-black/10 bg-white/70 text-slate-700 hover:bg-white"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Icon className="h-4 w-4" />
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
