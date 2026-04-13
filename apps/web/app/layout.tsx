import type { Metadata } from "next";
import type { ReactNode } from "react";
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
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable} font-sans`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

