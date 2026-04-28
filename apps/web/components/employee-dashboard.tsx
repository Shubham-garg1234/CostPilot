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
    status: string;
    totalTokens: number;
    costUsd: number;
    createdAt: string;
  }>;
  compliance: {
    governedCursorRequired: boolean;
    state: string;
    lastGovernedRequestAt?: string | null;
    activeKey?: {
      id: string;
      name: string;
      status: string;
      secretPreview: string;
      lastUsedAt?: string | null;
      expiresAt?: string | null;
    } | null;
  };
  cursorManagedConfig: {
    provider: string;
    baseUrl: string;
    apiVersion: string;
    chatCompletionsPath: string;
    header: string;
    keyStatus: string;
    apiKey?: string | null;
    secretPreview?: string | null;
    deployments: Array<{
      deployment: string;
      model: string;
      provider: string;
    }>;
    complianceState: string;
    lastGovernedRequestAt?: string | null;
  };
  fallbackMcpConfig: unknown;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function dateTime(value?: string | null) {
  if (!value) {
    return "Not seen yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
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
      setStatus("Sign in as an employee to view governed Cursor access and tracked usage.");
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

  async function copyValue(value: unknown, successMessage: string) {
    try {
      const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
      await navigator.clipboard.writeText(text);
      setCopyStatus(successMessage);
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
          <section className="grid gap-6 md:grid-cols-4">
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
            <Card className="p-6">
              <p className="text-sm text-slate-500">Compliance</p>
              <p className="mt-3 text-2xl font-semibold">{data.compliance.state}</p>
              <p className="mt-2 text-sm text-slate-600">
                Last governed request: {dateTime(data.compliance.lastGovernedRequestAt)}
              </p>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <Card className="p-6">
              <p className="text-sm text-slate-500">Managed Cursor Gateway</p>
              <h2 className="mt-2 font-display text-2xl font-semibold">Use this governed path for Cursor</h2>
              <p className="mt-3 text-sm text-slate-600">
                CostPilot records supported governed Cursor chat requests inline before a successful model response is returned. Cursor features that depend on Cursor-managed specialized models can still bypass this path, so MCP remains available for reporting and fallback imports.
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-[20px] bg-white/80 p-4 text-sm">
                  <p className="text-slate-500">Base URL</p>
                  <p className="mt-2 break-all font-medium text-slate-900">{data.cursorManagedConfig.baseUrl}</p>
                </div>
                <div className="rounded-[20px] bg-white/80 p-4 text-sm">
                  <p className="text-slate-500">API version</p>
                  <p className="mt-2 font-medium text-slate-900">{data.cursorManagedConfig.apiVersion}</p>
                  <p className="mt-2 text-slate-500">Header: {data.cursorManagedConfig.header}</p>
                </div>
              </div>

              <div className="mt-4 rounded-[20px] bg-stone-950 p-4 text-sm text-stone-100">
                <p className="text-stone-400">Managed gateway key</p>
                <pre className="mt-3 overflow-auto whitespace-pre-wrap break-all">
                  {data.cursorManagedConfig.apiKey ?? "Ask your admin to issue a managed Cursor key before configuring Cursor."}
                </pre>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={() =>
                    void copyValue(
                      {
                        provider: data.cursorManagedConfig.provider,
                        baseUrl: data.cursorManagedConfig.baseUrl,
                        apiVersion: data.cursorManagedConfig.apiVersion,
                        apiKey: data.cursorManagedConfig.apiKey,
                        deployments: data.cursorManagedConfig.deployments
                      },
                      "Copied the managed Cursor gateway config."
                    )
                  }
                  className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white"
                >
                  Copy Managed Config
                </button>
                <button
                  onClick={() => void copyValue(data.cursorManagedConfig.apiKey ?? "", "Copied the managed gateway key.")}
                  disabled={!data.cursorManagedConfig.apiKey}
                  className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:bg-stone-100"
                >
                  Copy Gateway Key
                </button>
                {copyStatus ? <p className="text-sm text-slate-600">{copyStatus}</p> : null}
              </div>

              <div className="mt-5 space-y-3">
                {data.cursorManagedConfig.deployments.map((deployment) => (
                  <div key={deployment.deployment} className="rounded-[18px] bg-white/75 px-4 py-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium">{deployment.deployment}</p>
                      <Pill>{deployment.provider}</Pill>
                    </div>
                    <p className="mt-2 text-slate-500">Model: {deployment.model}</p>
                    <p className="mt-1 break-all text-slate-500">
                      Endpoint: {data.cursorManagedConfig.baseUrl}{data.cursorManagedConfig.chatCompletionsPath.replace("{deployment}", deployment.deployment)}?api-version={data.cursorManagedConfig.apiVersion}
                    </p>
                  </div>
                ))}
              </div>
            </Card>

            <div className="space-y-6">
              <Card className="p-6">
                <p className="text-sm text-slate-500">Compliance State</p>
                <h2 className="mt-2 font-display text-2xl font-semibold">{data.compliance.state}</h2>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <p>Governed Cursor required: {data.compliance.governedCursorRequired ? "Yes" : "No"}</p>
                  <p>Last governed request seen: {dateTime(data.compliance.lastGovernedRequestAt)}</p>
                  <p>Key status: {data.cursorManagedConfig.keyStatus}</p>
                  <p>Key preview: {data.compliance.activeKey?.secretPreview ? `...${data.compliance.activeKey.secretPreview}` : "No active key"}</p>
                </div>
              </Card>

              <Card className="p-6">
                <p className="text-sm text-slate-500">Fallback MCP Tools</p>
                <h2 className="mt-2 font-display text-2xl font-semibold">Observability and manual imports</h2>
                <p className="mt-3 text-sm text-slate-600">
                  MCP still exposes reporting helpers like usage summary, budget status, and policy lookup. `track_usage_event` is retained as a fallback ingestion path for unsupported clients, not as the primary compliance control for governed Cursor chat traffic.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={() => void copyValue(data.fallbackMcpConfig, "Copied the fallback MCP config.")}
                    className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                  >
                    Copy Fallback MCP Config
                  </button>
                </div>
                <pre className="mt-5 overflow-auto rounded-[20px] bg-stone-950 p-4 text-xs text-stone-100">
                  {JSON.stringify(data.fallbackMcpConfig, null, 2)}
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
                          {event.provider} / {event.category} / {event.status} / {Intl.NumberFormat("en-US").format(event.totalTokens)} tokens
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
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
