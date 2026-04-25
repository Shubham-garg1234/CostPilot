"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { AlertTriangle, BarChart3, DatabaseZap, RefreshCcw, ShieldCheck, Wallet } from "lucide-react";
import { Card, Pill } from "./ui";
import { ApiError, requestJson } from "../lib/api";

type DashboardSummary = {
  metrics: Array<{ label: string; value: string; trend: string }>;
  topUsers: Array<{ id: string; name: string; role: string; category: string; costUsd: number; tokens: number; source?: string }>;
  topFeatures: Array<{ feature: string; category: string; costUsd: number; tokens: number; provider?: string; source?: string }>;
  sourceBreakdown: Array<{ source: string; costUsd: number; tokens: number; requests: number }>;
  providerBreakdown: Array<{ provider: string; costUsd: number; tokens: number; requests: number }>;
  recentViolations: Array<{ id: string; type: string; message: string; createdAt: string; actionTaken: string; role: string }>;
};

function number(value: number) {
  return Intl.NumberFormat("en-US").format(value);
}

function currency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

export function DashboardOverview() {
  const { isLoaded, isSignedIn } = useAuth();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("Unable to load dashboard data.");

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      setStatus("error");
      setError("Sign in to load dashboard data.");
      return;
    }

    void load();
  }, [isLoaded, isSignedIn]);

  async function load() {
    try {
      setStatus("loading");
      const payload = await requestJson<DashboardSummary>("/api/dashboard/summary", { authMode: "clerk" });
      setData(payload);
      setStatus("ready");
    } catch (issue) {
      setStatus("error");
      setError(issue instanceof ApiError ? issue.message : "Unable to load dashboard data.");
    }
  }

  if (status === "loading") {
    return (
      <div className="grid gap-6">
        {[0, 1, 2].map((index) => (
          <Card key={index} className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-4 w-32 rounded-full bg-black/10" />
              <div className="h-10 w-2/3 rounded-2xl bg-black/10" />
              <div className="grid gap-3 md:grid-cols-3">
                <div className="h-24 rounded-[22px] bg-black/10" />
                <div className="h-24 rounded-[22px] bg-black/10" />
                <div className="h-24 rounded-[22px] bg-black/10" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <Card className="p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <Pill tone="danger">Dashboard offline</Pill>
            <h1 className="mt-4 font-display text-4xl font-semibold">We could not load your production data.</h1>
            <p className="mt-3 max-w-2xl text-slate-600">{error}</p>
          </div>
          <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-medium text-white">
            <RefreshCcw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-[1.25fr_0.95fr]">
        <Card className="overflow-hidden p-8">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <Pill>Production Overview</Pill>
              <h1 className="mt-4 max-w-2xl font-display text-4xl font-semibold leading-tight md:text-6xl">
                Govern every LLM request with spend, policy, and reliability in one control plane.
              </h1>
              <p className="mt-4 max-w-2xl text-slate-600">
                Live data is pulled from your organization summary so admins can trust what they are seeing before making policy or billing decisions.
              </p>
            </div>
            <div className="rounded-[28px] border border-black/10 bg-black px-5 py-4 text-white">
              <p className="text-xs uppercase tracking-[0.24em] text-white/60">Data Status</p>
              <p className="mt-2 text-3xl font-semibold">Live</p>
              <p className="text-sm text-white/70">Backed by dashboard summary and usage aggregates</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {data.metrics.map((metric, index) => (
              <div key={metric.label} className={`rounded-[24px] p-5 ${index === 0 ? "bg-teal-900 text-white" : "bg-white/80 text-slate-800"}`}>
                <p className="text-sm opacity-70">{metric.label}</p>
                <p className="mt-3 text-3xl font-semibold">{metric.value}</p>
                <p className="mt-2 text-sm">{metric.trend}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-teal-900 p-3 text-white">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Governance Health</p>
              <p className="font-display text-2xl font-semibold">Recent policy activity</p>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            {data.recentViolations.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-black/10 bg-white/70 px-4 py-4 text-sm text-slate-600">
                No recent violations. This organization is operating within current policy bounds.
              </div>
            ) : (
              data.recentViolations.slice(0, 4).map((item) => (
                <div key={item.id} className="rounded-[22px] border border-black/10 bg-white/70 px-4 py-4 text-sm text-slate-700">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium">{item.type.replaceAll("_", " ")}</span>
                    <Pill tone={item.actionTaken === "BLOCK" ? "danger" : "warn"}>{item.actionTaken}</Pill>
                  </div>
                  <p className="mt-2">{item.message}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{item.role}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Provider Mix</p>
              <h2 className="font-display text-2xl font-semibold">Spend and traffic by model vendor</h2>
            </div>
            <DatabaseZap className="h-5 w-5 text-slate-500" />
          </div>
          <div className="space-y-3">
            {data.providerBreakdown.map((provider) => (
              <div key={provider.provider} className="grid grid-cols-[1fr_auto_auto] gap-3 rounded-[20px] bg-white/75 px-4 py-4 text-sm">
                <div>
                  <p className="font-medium capitalize">{provider.provider}</p>
                  <p className="text-slate-500">{number(provider.tokens)} tokens</p>
                </div>
                <span>{number(provider.requests)} req</span>
                <span className="font-medium">{currency(provider.costUsd)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Source Mix</p>
              <h2 className="font-display text-2xl font-semibold">Where requests are entering CostPilot</h2>
            </div>
            <BarChart3 className="h-5 w-5 text-slate-500" />
          </div>
          <div className="space-y-3">
            {data.sourceBreakdown.map((source) => (
              <div key={source.source} className="grid grid-cols-[1fr_auto_auto] gap-3 rounded-[20px] bg-white/75 px-4 py-4 text-sm">
                <div>
                  <p className="font-medium capitalize">{source.source}</p>
                  <p className="text-slate-500">{number(source.tokens)} tokens</p>
                </div>
                <span>{number(source.requests)} req</span>
                <span className="font-medium">{currency(source.costUsd)}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Top Users</p>
              <h2 className="font-display text-2xl font-semibold">Who is generating the highest spend</h2>
            </div>
            <Wallet className="h-5 w-5 text-slate-500" />
          </div>
          <div className="space-y-3">
            {data.topUsers.map((user) => (
              <div key={user.id} className="grid gap-3 rounded-[20px] border border-black/10 bg-white/80 px-4 py-4 md:grid-cols-[1.1fr_auto_auto_auto]">
                <div>
                  <p className="font-medium">{user.name}</p>
                  <p className="text-sm text-slate-500">{user.role} · {user.category}</p>
                </div>
                <span className="text-sm text-slate-600">{user.source ?? "sdk"}</span>
                <span className="text-sm text-slate-600">{number(user.tokens)} tokens</span>
                <span className="font-medium">{currency(user.costUsd)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-700" />
            <div>
              <p className="text-sm text-slate-500">Top Features</p>
              <h2 className="font-display text-2xl font-semibold">Most expensive workflows</h2>
            </div>
          </div>
          <div className="space-y-3">
            {data.topFeatures.map((feature) => (
              <div key={`${feature.category}-${feature.feature}`} className="rounded-[22px] bg-white/75 p-4">
                <div className="flex items-center justify-between gap-4">
                  <Pill tone="warn">{feature.provider ?? "mixed"}</Pill>
                  <span className="text-sm font-medium">{currency(feature.costUsd)}</span>
                </div>
                <p className="mt-3 font-medium">{feature.feature}</p>
                <p className="mt-2 text-sm text-slate-600">
                  {feature.category} · {number(feature.tokens)} tokens · {feature.source ?? "all sources"}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
