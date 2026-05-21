import type { PropsWithChildren } from "react";
import { AppShellClient } from "./app-shell-client";

export function AppShell({ children, clerkEnabled }: PropsWithChildren<{ clerkEnabled?: boolean }>) {
  return <AppShellClient clerkEnabled={clerkEnabled}>{children}</AppShellClient>;
}
