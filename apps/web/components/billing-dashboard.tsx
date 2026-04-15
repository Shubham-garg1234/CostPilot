"use client";

import { useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { Card, Pill } from "./ui";
import { ApiError, requestJson } from "../lib/api";

type BillingRecord = {
  id: string;
  periodStart: string;
  rawCostUsd: number;
  markupPercentage: number;
  finalCostUsd: number;
  status: string;
};

type BillingResponse = {
  records: BillingRecord[];
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(value));
}

export function BillingDashboard() {
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("Unable to load billing records.");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      setStatus("loading");
      const payload = await requestJson<BillingResponse>("/api/billing/current");
      setRecords(payload.records);
      setStatus("ready");
    } catch (issue) {
      setStatus("error");
      setError(issue instanceof ApiError ? issue.message : "Unable to load billing records.");
    }
  }

  const latest = records[0];

  return (
    <main className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <Card className="p-6">
        <Pill>Usage-Based Billing</Pill>
        <h1 className="mt-4 font-display text-4xl font-semibold">Meter every token, invoice every organization with confidence.</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Billing records are generated from tracked usage, stored per billing period, and shown here for finance, operations, and internal chargeback reviews.
        </p>
        {status === "loading" ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="h-36 animate-pulse rounded-[24px] bg-black/10" />
            <div className="h-36 animate-pulse rounded-[24px] bg-black/10" />
          </div>
        ) : status === "error" ? (
          <div className="mt-8 rounded-[24px] border border-rose-200 bg-rose-50 p-5 text-rose-900">
            <p className="font-medium">{error}</p>
            <button onClick={() => void load()} className="mt-4 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
              <RefreshCcw className="h-4 w-4" />
              Retry
            </button>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] bg-teal-900 p-5 text-white">
              <p className="text-sm text-white/70">Current cycle estimate</p>
              <p className="mt-3 text-4xl font-semibold">{latest ? money(Number(latest.finalCostUsd)) : money(0)}</p>
              <p className="mt-2 text-sm text-white/70">
                {latest ? `${Number(latest.markupPercentage).toFixed(1)}% markup applied` : "No billing records yet"}
              </p>
            </div>
            <div className="rounded-[24px] bg-white/80 p-5">
              <p className="text-sm text-slate-500">Underlying provider cost</p>
              <p className="mt-3 text-4xl font-semibold">{latest ? money(Number(latest.rawCostUsd)) : money(0)}</p>
              <p className="mt-2 text-sm text-slate-600">
                {latest ? `Billing window: ${monthLabel(latest.periodStart)}` : "Generate your first billing cycle after usage starts"}
              </p>
            </div>
          </div>
        )}
      </Card>
      <Card className="p-6">
        <p className="text-sm text-slate-500">Recent billing records</p>
        <h2 className="font-display text-2xl font-semibold">Invoices</h2>
        <div className="mt-5 space-y-3">
          {status === "ready" && records.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-black/10 bg-white/70 px-4 py-5 text-sm text-slate-600">
              No billing records have been generated yet.
            </div>
          ) : (
            records.map((invoice) => (
              <div key={invoice.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-center rounded-[20px] bg-white/75 px-4 py-3 text-sm">
                <span className="font-medium">{monthLabel(invoice.periodStart)}</span>
                <span>{money(Number(invoice.rawCostUsd))}</span>
                <span>{Number(invoice.markupPercentage).toFixed(1)}%</span>
                <span>{money(Number(invoice.finalCostUsd))}</span>
                <Pill>{invoice.status}</Pill>
              </div>
            ))
          )}
        </div>
      </Card>
    </main>
  );
}
