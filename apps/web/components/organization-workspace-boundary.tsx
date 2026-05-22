"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { OrganizationWorkspaceProvider } from "./organization-workspace-provider";

function isOrganizationWorkspace(pathname: string) {
  return (
    pathname.startsWith("/organization") ||
    pathname.startsWith("/policies") ||
    pathname.startsWith("/alerts") ||
    pathname.startsWith("/billing")
  );
}

export function OrganizationWorkspaceBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (!isOrganizationWorkspace(pathname)) {
    return children;
  }

  return <OrganizationWorkspaceProvider>{children}</OrganizationWorkspaceProvider>;
}
