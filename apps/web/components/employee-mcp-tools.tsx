"use client";

import { useEffect, useState } from "react";
import { ApiError, requestJson } from "../lib/api";
import { formatCostUsd } from "../lib/currency";
import { Card } from "./ui";

type UsageSummary = {
  rangeDays: number;
  totals: { totalTokens: number; costUsd: number; requestCount: number };
  bySource: Array<{ source: string; totalTokens: number; costUsd: number; requestCount: number }>;
  byCategory: Array<{ category: string; totalTokens: number; costUsd: number; requestCount: number }>;
  byProvider: Array<{ provider: string; totalTokens: number; costUsd: number; requestCount: number }>;
};

type PolicyRecord = {
  id: string;
  role: string;
  category: string;
  feature?: string | null;
  maxTokensPerDay?: number | null;
  maxRequestsPerHour?: number | null;
  maxCostPerMonthUsd?: number | null;
  actionOnViolation: string;
};

type PromptEnhancementResult = {
  refinedPrompt: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  usage?: { costUsd: number };
};

export function EmployeeMcpTools() {
  const [rawPrompt, setRawPrompt] = useState("");
  const [enhancedPrompt, setEnhancedPrompt] = useState("");
  const [enhanceStatus, setEnhanceStatus] = useState("");
  const [enhanceCost, setEnhanceCost] = useState<number | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [summaryStatus, setSummaryStatus] = useState("");
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [policiesStatus, setPoliciesStatus] = useState("");
  const [organizationEmail, setOrganizationEmail] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const email = window.Clerk?.loaded ? window.Clerk.user?.primaryEmailAddress?.emailAddress : undefined;
    setOrganizationEmail(email ?? null);
  }, []);

  async function runEnhancePrompt() {
    if (!rawPrompt.trim()) {
      setEnhanceStatus("Enter a prompt to refine.");
      return;
    }

    try {
      setEnhancing(true);
      setEnhanceStatus("Enhancing prompt...");
      const result = await requestJson<PromptEnhancementResult>("/api/prompt-enhancement", {
        method: "POST",
        authMode: "employee",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: rawPrompt,
          source: "web",
          integrationType: "direct",
          metadata: { surface: "employee_dashboard" }
        })
      });
      setEnhancedPrompt(result.refinedPrompt);
      setEnhanceCost(result.usage?.costUsd ?? result.costUsd);
      setEnhanceStatus(`Refined with ${result.model} (${result.totalTokens} tokens).`);
    } catch (error) {
      setEnhancedPrompt("");
      setEnhanceCost(null);
      setEnhanceStatus(error instanceof ApiError ? error.message : "Unable to enhance prompt.");
    } finally {
      setEnhancing(false);
    }
  }

  async function loadUsageSummary() {
    try {
      setSummaryStatus("Loading usage summary...");
      const payload = await requestJson<UsageSummary>("/api/usage-events/summary?days=30", {
        authMode: "employee"
      });
      setSummary(payload);
      setSummaryStatus(`Last ${payload.rangeDays} days for your account.`);
    } catch (error) {
      setSummary(null);
      setSummaryStatus(error instanceof ApiError ? error.message : "Unable to load usage summary.");
    }
  }

  async function loadPolicies() {
    try {
      setPoliciesStatus("Loading policies...");
      const payload = await requestJson<PolicyRecord[]>("/api/policies", { authMode: "employee" });
      setPolicies(payload);
      setPoliciesStatus(payload.length ? `${payload.length} active policies for your role.` : "No policies configured for your role.");
    } catch (error) {
      setPolicies([]);
      setPoliciesStatus(error instanceof ApiError ? error.message : "Unable to load policies.");
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-2">
      <Card className="p-6">
        <p className="text-sm text-slate-500">MCP tool</p>
        <h2 className="mt-2 font-display text-2xl font-semibold">enhance_prompt</h2>
        <p className="mt-3 text-sm text-slate-600">
          Same API as the CostPilot MCP <code className="rounded bg-black/5 px-1 py-0.5">enhance_prompt</code> tool. Costs are shown at{" "}
          {formatCostUsd(0.00001)} precision.
        </p>
        <textarea
          value={rawPrompt}
          onChange={(event) => setRawPrompt(event.target.value)}
          className="mt-4 min-h-28 w-full rounded-[20px] border border-black/10 bg-white px-4 py-3 text-sm"
          placeholder="Paste a rough Cursor prompt to refine..."
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void runEnhancePrompt()}
            disabled={enhancing}
            className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {enhancing ? "Enhancing..." : "Enhance prompt"}
          </button>
          {enhanceCost !== null ? (
            <span className="text-sm text-slate-600">Cost: {formatCostUsd(enhanceCost)}</span>
          ) : null}
        </div>
        {enhanceStatus ? <p className="mt-3 text-sm text-slate-600">{enhanceStatus}</p> : null}
        {enhancedPrompt ? (
          <pre className="mt-4 overflow-auto rounded-[20px] bg-stone-950 p-4 text-xs text-stone-100 whitespace-pre-wrap">{enhancedPrompt}</pre>
        ) : null}
      </Card>

      <Card className="p-6">
        <p className="text-sm text-slate-500">MCP tool</p>
        <h2 className="mt-2 font-display text-2xl font-semibold">get_usage_summary</h2>
        <p className="mt-3 text-sm text-slate-600">Personal usage for the last 30 days (employee-scoped).</p>
        <button
          type="button"
          onClick={() => void loadUsageSummary()}
          className="mt-4 rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-medium text-slate-800"
        >
          Load usage summary
        </button>
        {summaryStatus ? <p className="mt-3 text-sm text-slate-600">{summaryStatus}</p> : null}
        {summary ? (
          <div className="mt-5 space-y-4 text-sm">
            <div className="rounded-[20px] bg-white/80 px-4 py-4">
              <p className="font-medium">Totals</p>
              <p className="mt-2 text-slate-600">
                {summary.totals.requestCount} requests · {Intl.NumberFormat("en-US").format(summary.totals.totalTokens)} tokens ·{" "}
                {formatCostUsd(summary.totals.costUsd)}
              </p>
            </div>
            {summary.byProvider.length ? (
              <div>
                <p className="font-medium text-slate-800">By provider</p>
                <ul className="mt-2 space-y-2">
                  {summary.byProvider.map((row) => (
                    <li key={row.provider} className="flex justify-between gap-4 rounded-[16px] bg-white/70 px-3 py-2">
                      <span>{row.provider}</span>
                      <span>{formatCostUsd(row.costUsd)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card className="p-6 xl:col-span-2">
        <p className="text-sm text-slate-500">MCP tool</p>
        <h2 className="mt-2 font-display text-2xl font-semibold">list_policies</h2>
        <p className="mt-3 text-sm text-slate-600">Policies that apply to your employee role in this organization.</p>
        <button
          type="button"
          onClick={() => void loadPolicies()}
          className="mt-4 rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-medium text-slate-800"
        >
          Load policies
        </button>
        {policiesStatus ? <p className="mt-3 text-sm text-slate-600">{policiesStatus}</p> : null}
        {policies.length ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {policies.map((policy) => (
              <div key={policy.id} className="rounded-[20px] bg-white/80 px-4 py-4 text-sm">
                <p className="font-medium">
                  {policy.category}
                  {policy.feature ? ` · ${policy.feature}` : ""}
                </p>
                <p className="mt-2 text-slate-500">
                  Role {policy.role} · on violation: {policy.actionOnViolation}
                </p>
                <p className="mt-1 text-slate-500">
                  {policy.maxTokensPerDay != null ? `${policy.maxTokensPerDay} tokens/day` : "No daily token cap"} ·{" "}
                  {policy.maxCostPerMonthUsd != null ? `${formatCostUsd(Number(policy.maxCostPerMonthUsd))}/month` : "No monthly cost cap"}
                </p>
              </div>
            ))}
          </div>
        ) : null}
        <p className="mt-5 text-sm text-slate-600">
          In Cursor, <code className="rounded bg-black/5 px-1 py-0.5">get_budget_status</code> returns organization-wide dashboard metrics (admins use the
          organization overview). <code className="rounded bg-black/5 px-1 py-0.5">track_usage_event</code> runs automatically when you follow the project rules.
        </p>
        {organizationEmail ? (
          <p className="mt-2 text-sm text-amber-800">
            You are also signed in with organization login ({organizationEmail}). Use Organization Logout in the header to avoid mixed sessions.
          </p>
        ) : null}
      </Card>
    </section>
  );
}
