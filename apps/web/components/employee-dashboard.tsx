"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { costpilotMcpRulesMdc } from "../lib/costpilot-employee-mcp-content";
import { ApiError, clearEmployeeAccessToken, getEmployeeAccessToken, requestJson } from "../lib/api";
import { signOutEmployee } from "../lib/auth-session";
import { formatCostUsd } from "../lib/currency";
import { EmployeeMcpTools } from "./employee-mcp-tools";
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

export function EmployeeDashboard() {
  const [data, setData] = useState<EmployeeDashboardPayload | null>(null);
  const [status, setStatus] = useState("Loading your employee dashboard...");
  const [copyStatus, setCopyStatus] = useState("");
  const [rulesCopyStatus, setRulesCopyStatus] = useState("");
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

  async function copyRulesTemplate() {
    try {
      await navigator.clipboard.writeText(costpilotMcpRulesMdc);
      setRulesCopyStatus("Copied the rules file contents. Save as .cursor/rules/costpilot-mcp.mdc");
    } catch {
      setRulesCopyStatus("Unable to copy automatically. Select the template below and copy.");
    }
  }

  function signOut() {
    void signOutEmployee({
      signOutClerk: window.Clerk?.loaded ? () => window.Clerk?.signOut?.() : undefined,
      redirectTo: "/employee/login"
    });
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
              <p className="mt-3 text-4xl font-semibold">{formatCostUsd(data.usage.totalCostUsd)}</p>
              <p className="mt-1 text-xs text-slate-500">Shown to {formatCostUsd(0.00001)} (5 decimal places)</p>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <Card className="p-6">
              <p className="text-sm text-slate-500">Step-by-step</p>
              <h2 className="mt-2 font-display text-2xl font-semibold">Set up the CostPilot MCP server in Cursor</h2>
              <p className="mt-3 text-sm text-slate-600">
                Node.js must be installed so <code className="rounded bg-black/5 px-1 py-0.5">npx</code> can run the MCP package. Ask your admin if{" "}
                <code className="rounded bg-black/5 px-1 py-0.5">COSTPILOT_API_URL</code> in the JSON should point to production or localhost.
              </p>
              <ol className="mt-5 list-decimal space-y-4 pl-5 text-sm text-slate-700 marker:font-semibold">
                <li>
                  <strong className="text-slate-900">Open Cursor Settings.</strong> Press{" "}
                  <kbd className="rounded border border-black/15 bg-white px-1.5 py-0.5 font-mono text-xs">Ctrl</kbd> +{" "}
                  <kbd className="rounded border border-black/15 bg-white px-1.5 py-0.5 font-mono text-xs">Shift</kbd> +{" "}
                  <kbd className="rounded border border-black/15 bg-white px-1.5 py-0.5 font-mono text-xs">J</kbd> (Windows/Linux) or{" "}
                  <kbd className="rounded border border-black/15 bg-white px-1.5 py-0.5 font-mono text-xs">⌘</kbd> +{" "}
                  <kbd className="rounded border border-black/15 bg-white px-1.5 py-0.5 font-mono text-xs">Shift</kbd> +{" "}
                  <kbd className="rounded border border-black/15 bg-white px-1.5 py-0.5 font-mono text-xs">J</kbd> (macOS). Or open the Command Palette (
                  <kbd className="rounded border border-black/15 bg-white px-1.5 py-0.5 font-mono text-xs">Ctrl</kbd>/<kbd className="rounded border border-black/15 bg-white px-1.5 py-0.5 font-mono text-xs">⌘</kbd> +{" "}
                  <kbd className="rounded border border-black/15 bg-white px-1.5 py-0.5 font-mono text-xs">Shift</kbd> +{" "}
                  <kbd className="rounded border border-black/15 bg-white px-1.5 py-0.5 font-mono text-xs">P</kbd>), type <strong>Cursor Settings</strong>, and press Enter. Alternatively: click your{" "}
                  <strong>profile or gear icon</strong> (often bottom-left or top-right, depending on your Cursor version) and choose{" "}
                  <strong>Cursor Settings</strong>.
                </li>
                <li>
                  <strong className="text-slate-900">Go to MCP.</strong> In the left sidebar, open <strong>MCP</strong> (sometimes under{" "}
                  <strong>Features</strong> depending on your Cursor version).
                </li>
                <li>
                  <strong className="text-slate-900">Edit the MCP config file.</strong> Use <strong>Add new global MCP server</strong>,{" "}
                  <strong>Open MCP config</strong>, <strong>Edit in settings.json</strong>, or <strong>View raw config</strong> — the label varies by
                  version. Cursor opens a JSON file (often named <code className="rounded bg-black/5 px-1 py-0.5">mcp.json</code>) at roughly{" "}
                  <code className="rounded bg-black/5 px-1 py-0.5">%USERPROFILE%\.cursor\mcp.json</code> on Windows or{" "}
                  <code className="rounded bg-black/5 px-1 py-0.5">~/.cursor/mcp.json</code> on macOS/Linux.
                </li>
                <li>
                  <strong className="text-slate-900">Merge the CostPilot block.</strong> The snippet from this page is only the{" "}
                  <code className="rounded bg-black/5 px-1 py-0.5">mcpServers</code> object. If your file already has{" "}
                  <code className="rounded bg-black/5 px-1 py-0.5">mcpServers</code>, add the <code className="rounded bg-black/5 px-1 py-0.5">costpilot</code>{" "}
                  entry inside it. If the file is new, wrap the copied JSON in braces so the top level is{" "}
                  <code className="rounded bg-black/5 px-1 py-0.5">{`{ "mcpServers": { ... } }`}</code>.
                </li>
                <li>
                  <strong className="text-slate-900">Fix secrets.</strong> Replace <code className="rounded bg-black/5 px-1 py-0.5">paste-your-password-here</code>{" "}
                  with the password your organization sent you. Confirm <code className="rounded bg-black/5 px-1 py-0.5">COSTPILOT_API_URL</code> matches
                  your company&apos;s API base URL (your admin may give you a hosted URL instead of localhost).
                </li>
                <li>
                  <strong className="text-slate-900">Save and reload MCP.</strong> Save the JSON file. If Cursor asks to reload MCP servers, accept. If
                  not, fully quit and reopen Cursor, or use the MCP panel&apos;s refresh/restart control if shown.
                </li>
                <li>
                  <strong className="text-slate-900">Confirm tools.</strong> In the MCP section you should see the <strong>costpilot</strong> server with
                  tools including <code className="rounded bg-black/5 px-1 py-0.5">enhance_prompt</code>,{" "}
                  <code className="rounded bg-black/5 px-1 py-0.5">track_usage_event</code>,{" "}
                  <code className="rounded bg-black/5 px-1 py-0.5">get_usage_summary</code>, <code className="rounded bg-black/5 px-1 py-0.5">get_budget_status</code>, and{" "}
                  <code className="rounded bg-black/5 px-1 py-0.5">list_policies</code>. If the server shows an error, check Node, network, API URL, and
                  email/password.
                </li>
              </ol>
            </Card>

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
                        <span>{formatCostUsd(event.costUsd)}</span>
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

          <EmployeeMcpTools />

          <section className="grid gap-6">
            <Card className="p-6">
              <p className="text-sm text-slate-500">Agent rules (recommended)</p>
              <h2 className="mt-2 font-display text-2xl font-semibold">Make Cursor always use CostPilot MCP tools</h2>
              <p className="mt-3 text-sm text-slate-600">
                Cursor <strong>project rules</strong> live under <code className="rounded bg-black/5 px-1 py-0.5">.cursor/rules/</code> as{" "}
                <code className="rounded bg-black/5 px-1 py-0.5">*.mdc</code> files (YAML frontmatter + markdown). That is the supported way to enforce
                behavior like &quot;always call <code className="rounded bg-black/5 px-1 py-0.5">track_usage_event</code>&quot;. A plain{" "}
                <code className="rounded bg-black/5 px-1 py-0.5">rules.md</code> only applies if your team puts the same text inside a skill or doc;
                prefer <code className="rounded bg-black/5 px-1 py-0.5">costpilot-mcp.mdc</code> below.
              </p>
              <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm text-slate-700 marker:font-semibold">
                <li>
                  In Cursor&apos;s <strong>Explorer</strong>, open the root folder of the repo you work in (or create a small folder you always open as
                  your &quot;employee&quot; workspace).
                </li>
                <li>
                  Create the folders <code className="rounded bg-black/5 px-1 py-0.5">.cursor</code> then <code className="rounded bg-black/5 px-1 py-0.5">rules</code> if they do not exist (
                  full path: <code className="rounded bg-black/5 px-1 py-0.5">.cursor/rules/</code>).
                </li>
                <li>
                  Create a new file named <code className="rounded bg-black/5 px-1 py-0.5">costpilot-mcp.mdc</code> inside <code className="rounded bg-black/5 px-1 py-0.5">.cursor/rules/</code>.
                </li>
                <li>
                  Click <strong>Copy rules template</strong> below, paste into that file, and save. The frontmatter includes{" "}
                  <code className="rounded bg-black/5 px-1 py-0.5">alwaysApply: true</code> so the agent sees it in every chat for this project.
                </li>
                <li>
                  Start a new Agent chat to pick up the rule. The agent should call <code className="rounded bg-black/5 px-1 py-0.5">track_usage_event</code> after
                  every assistant reply (including one-liners), use <code className="rounded bg-black/5 px-1 py-0.5">enhance_prompt</code> before substantive prompts, and use <code className="rounded bg-black/5 px-1 py-0.5">get_usage_summary</code>,{" "}
                  <code className="rounded bg-black/5 px-1 py-0.5">get_budget_status</code>, and <code className="rounded bg-black/5 px-1 py-0.5">list_policies</code> when relevant.
                </li>
              </ol>
              <p className="mt-4 text-sm text-slate-600">
                <strong>Optional (Cursor Agent Skills):</strong> skills use a <code className="rounded bg-black/5 px-1 py-0.5">SKILL.md</code> file under your
                user skills directory, not <code className="rounded bg-black/5 px-1 py-0.5">rules.md</code>. If your org standardizes on skills, create a skill
                folder and put the same policy text in <code className="rounded bg-black/5 px-1 py-0.5">SKILL.md</code>; project rules in{" "}
                <code className="rounded bg-black/5 px-1 py-0.5">.cursor/rules/</code> are usually simpler for a whole team.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void copyRulesTemplate()}
                  className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-medium text-slate-800"
                >
                  Copy rules template
                </button>
                {rulesCopyStatus ? <p className="text-sm text-slate-600">{rulesCopyStatus}</p> : null}
              </div>
              <pre className="mt-5 max-h-[min(28rem,50vh)] overflow-auto rounded-[20px] bg-stone-950 p-4 text-xs text-stone-100 whitespace-pre-wrap">
                {costpilotMcpRulesMdc}
              </pre>
            </Card>
          </section>
        </>
      ) : null}
    </main>
  );
}
