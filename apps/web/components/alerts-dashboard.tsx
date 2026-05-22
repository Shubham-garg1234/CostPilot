"use client";

import { useEffect } from "react";
import { BellRing, RefreshCcw } from "lucide-react";
import { Card, Pill } from "./ui";
import { useOrganizationWorkspace } from "./organization-workspace-provider";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function AlertsDashboard() {
  const { authReady, dashboard, ensureDashboard } = useOrganizationWorkspace();

  useEffect(() => {
    if (!authReady) {
      return;
    }

    void ensureDashboard();
  }, [authReady, ensureDashboard]);

  const items = dashboard.data?.recentViolations ?? [];
  const status = dashboard.status === "idle" ? "loading" : dashboard.status;
  const error = dashboard.error || "Unable to load alerts.";

  return (
    <main className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-amber-100 p-3 text-amber-900">
            <BellRing className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Notifications</p>
            <h1 className="font-display text-4xl font-semibold">Quota alerts and recent policy activity</h1>
          </div>
        </div>
        <p className="mt-3 max-w-3xl text-slate-600">
          This feed reflects recent violations and policy-triggered events so admins can see which users, roles, and categories need action.
        </p>
      </Card>
      {status === "error" ? (
        <Card className="p-6">
          <p className="font-medium text-rose-900">{error}</p>
          <button onClick={() => void ensureDashboard({ force: true })} className="mt-4 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            <RefreshCcw className="h-4 w-4" />
            Retry
          </button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {status === "ready" && items.length === 0 ? (
            <Card className="p-6">
              <p className="text-slate-600">No recent alerts. Your current policies are holding without recent violations.</p>
            </Card>
          ) : (
            items.map((alert) => (
              <Card key={alert.id} className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Pill tone={alert.actionTaken === "BLOCK" ? "danger" : "warn"}>{alert.actionTaken}</Pill>
                    <p className="mt-3 text-xl font-semibold">{alert.type.replaceAll("_", " ")}</p>
                    <p className="mt-2 max-w-3xl text-slate-600">{alert.message}</p>
                    <p className="mt-3 text-sm text-slate-500">{alert.role} · {formatTime(alert.createdAt)}</p>
                  </div>
                  <div className="rounded-full border border-black/10 px-4 py-2 text-sm">Review policy</div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </main>
  );
}
