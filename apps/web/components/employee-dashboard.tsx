"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, clearEmployeeAccessToken, getEmployeeAccessToken, requestJson } from "../lib/api";
import { Card, Pill } from "./ui";

type EmployeeDashboardPayload = {
  user: {
    fullName: string;
    email: string;
    organizationId: string;
    organizationName: string;
    role: string;
  };
  usage: {
    totalRequests: number;
    totalTokens: number;
    totalCostUsd: number;
  };
  recentEvents: Array<{
    id: string;
    model: string;
    provider: string;
    category: string;
    feature?: string | null;
    totalTokens: number;
    costUsd: number;
    createdAt: string;
  }>;
  cursorConfig: unknown;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function EmployeeDashboard() {
  const [data, setData] = useState<EmployeeDashboardPayload | null>(null);
  const [status, setStatus] = useState("Loading your employee dashboard...");
  const [copyStatus, setCopyStatus] = useState("");
  const [checkedAuth, setCheckedAuth] = useState(false);

  useEffect(() => {
    const token = getEmployeeAccessToken();
    if (!token) {
      setCheckedAuth(true);
      setStatus("Sign in as an employee to view your usage and MCP setup.");
      return;
    }

    void load();
  }, []);

  async function load() {
    try {
      const payload = await requestJson<EmployeeDashboardPayload>("/api/auth/employee-dashboard", {
        authMode: "employee"
      });
      setData(payload);
      setStatus(`Loaded ${payload.user.organizationName}`);
    } catch (error) {
      clearEmployeeAccessToken();
      setData(null);
      setStatus(error instanceof ApiError ? error.message : "Unable to load employee dashboard.");
    } finally {
      setCheckedAuth(true);
    }
  }

  async function copyCursorConfig() {
    if (!data) {
      return;
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(data.cursorConfig, null, 2));
      setCopyStatus("Copied the full Cursor MCP config.");
    } catch {
      setCopyStatus("Unable to copy automatically. Please copy it manually.");
    }
  }

  function signOut() {
    clearEmployeeAccessToken();
    setData(null);
    setCheckedAuth(true);
    setStatus("Signed out.");
  }

  if (checkedAuth && !data) {
    return (
      <main className="space-y-6">
        <Card className="p-8">
          <p className="text-sm text-slate-500">Employee Access</p>
          <h1 className="mt-3 font-display text-4xl font-semibold">Employee login required</h1>
          <p className="mt-3 max-w-3xl text-slate-600">{status}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/employee/login" className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white">
              Go to Employee Login
            </Link>
            <Link
              href="/organization/login"
              className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium text-slate-700"
            >
              Organization Login
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <Card className="p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Employee Dashboard</p>
            <h1 className="mt-3 font-display text-4xl font-semibold">{data ? data.user.fullName : "Loading employee access"}</h1>
            <p className="mt-3 max-w-3xl text-slate-600">{status}</p>
          </div>
          {data ? (
            <div className="flex gap-3">
              <Pill>{data.user.role}</Pill>
              <button onClick={signOut} className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                Sign Out
              </button>
            </div>
          ) : null}
        </div>
      </Card>

      {data ? (
        <>
          <section className="grid gap-6 md:grid-cols-3">
            <Card className="p-6">
              <p className="text-sm text-slate-500">Requests</p>
              <p className="mt-3 text-4xl font-semibold">{data.usage.totalRequests}</p>
            </Card>
            <Card className="p-6">
              <p className="text-sm text-slate-500">Tokens</p>
              <p className="mt-3 text-4xl font-semibold">{Intl.NumberFormat("en-US").format(data.usage.totalTokens)}</p>
            </Card>
            <Card className="p-6">
              <p className="text-sm text-slate-500">Spend</p>
              <p className="mt-3 text-4xl font-semibold">{money(data.usage.totalCostUsd)}</p>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <Card className="p-6">
              <p className="text-sm text-slate-500">Cursor MCP Config</p>
              <h2 className="mt-2 font-display text-2xl font-semibold">Copy this into Cursor</h2>
              <p className="mt-3 text-sm text-slate-600">
                Replace `paste-your-password-here` with the password your organization emailed to you.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button onClick={() => void copyCursorConfig()} className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
                  Copy Full Config
                </button>
                {copyStatus ? <p className="text-sm text-slate-600">{copyStatus}</p> : null}
              </div>
              <pre className="mt-5 overflow-auto rounded-[20px] bg-stone-950 p-4 text-xs text-stone-100">
                {JSON.stringify(data.cursorConfig, null, 2)}
              </pre>
            </Card>

            <Card className="p-6">
              <p className="text-sm text-slate-500">Recent usage</p>
              <h2 className="mt-2 font-display text-2xl font-semibold">Your latest tracked requests</h2>
              <div className="mt-5 space-y-3">
                {data.recentEvents.length ? (
                  data.recentEvents.map((event) => (
                    <div key={event.id} className="rounded-[20px] bg-white/80 px-4 py-4 text-sm">
                      <div className="flex items-center justify-between gap-4">
                        <p className="font-medium">{event.model}</p>
                        <span>{money(event.costUsd)}</span>
                      </div>
                      <p className="mt-2 text-slate-500">
                        {event.provider} · {event.category} · {Intl.NumberFormat("en-US").format(event.totalTokens)} tokens
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[18px] border border-dashed border-black/10 bg-white/70 px-4 py-4 text-sm text-slate-600">
                    No usage events recorded yet for this employee account.
                  </div>
                )}
              </div>
            </Card>
          </section>
        </>
      ) : null}
    </main>
  );
}
