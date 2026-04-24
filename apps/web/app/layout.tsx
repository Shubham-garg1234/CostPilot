import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { AppShell } from "../components/shell";

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans"
});

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display"
});

export const metadata: Metadata = {
  title: "CostPilot AI",
  description: "LLM governance, cost control, and observability platform"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const rawClerkPublishableKey =
    process.env.CLERK_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const clerkPublishableKey =
    rawClerkPublishableKey && !rawClerkPublishableKey.endsWith("_xxx") ? rawClerkPublishableKey : undefined;

  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable} font-sans`}>
        {clerkPublishableKey ? (
          <ClerkProvider publishableKey={clerkPublishableKey}>
            <AppShell clerkEnabled>{children}</AppShell>
          </ClerkProvider>
        ) : (
          <AppShell clerkEnabled={false}>{children}</AppShell>
        )}
      </body>
    </html>
  );
}
