"use client";

import { CheckCircle2, FileText, FolderOpen, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  costpilotAgentInstructionsMarkdown,
  costpilotCursorRulesMdc
} from "../lib/costpilot-employee-mcp-content";
import { ApiError, clearEmployeeAccessToken, getEmployeeAccessToken, requestJson, setEmployeeAccessToken } from "../lib/api";
import { signOutEmployee } from "../lib/auth-session";
import { formatCostUsd } from "../lib/currency";
import { Card, Pill, cn } from "./ui";

type McpServerConfig = {
  type: "stdio";
  command: string;
  args: string[];
  env: {
    COSTPILOT_API_URL: string;
    COSTPILOT_EMPLOYEE_EMAIL: string;
    COSTPILOT_EMPLOYEE_PASSWORD: string;
  };
};

type CursorMcpConfig = {
  mcpServers: {
    costpilot: McpServerConfig;
  };
};

type AgentKey = "cursor" | "claude" | "copilot" | "codex";

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
  cursorConfig: CursorMcpConfig;
};

type EmployeeLoginResponse = {
  token: string;
};

type AgentSetup = {
  key: AgentKey;
  name: string;
  description: string;
  setupLabel: string;
  setupHref?: string;
  configTitle: string;
  configText: string;
  instructionPath: string;
  instructionText: string;
  projectFiles: Array<{ path: string; contents: string }>;
  steps: string[];
  verify: string;
  docsHref: string;
};

type SetupToast = {
  tone: "success" | "error" | "info";
  message: string;
};

type CostPilotDirectoryHandle = {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<CostPilotDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{
    createWritable(): Promise<{
      write(contents: string): Promise<void>;
      close(): Promise<void>;
    }>;
  }>;
};

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<CostPilotDirectoryHandle>;
  }
}

const agentOptions: Array<{ key: AgentKey; name: string }> = [
  { key: "cursor", name: "Cursor" },
  { key: "claude", name: "Claude Code" },
  { key: "copilot", name: "GitHub Copilot" },
  { key: "codex", name: "OpenAI Codex" }
];

export function EmployeeDashboard() {
  const [data, setData] = useState<EmployeeDashboardPayload | null>(null);
  const [status, setStatus] = useState("Loading your employee dashboard...");
  const [setupStatus, setSetupStatus] = useState("");
  const [employeePassword, setEmployeePassword] = useState("");
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [pendingSetupKey, setPendingSetupKey] = useState<AgentKey>("cursor");
  const [setupToast, setSetupToast] = useState<SetupToast | null>(null);
  const [setupRunning, setSetupRunning] = useState(false);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [activeAgent, setActiveAgent] = useState<AgentKey>("cursor");

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

  function startSetup(setup: AgentSetup) {
    setPendingSetupKey(setup.key);
    setEmployeePassword("");
    setSetupStatus("");
    setSetupToast(null);
    setPasswordDialogOpen(true);
  }

  function closePasswordDialog() {
    if (setupRunning) {
      return;
    }

    setPasswordDialogOpen(false);
    setEmployeePassword("");
  }

  function showSetupToast(tone: SetupToast["tone"], message: string) {
    setSetupToast({ tone, message });
  }

  async function applyProjectFiles(setup: AgentSetup) {
    if (!data) {
      return;
    }

    const password = employeePassword;
    if (password.trim().length < 6) {
      setSetupStatus("");
      showSetupToast("error", "Password must be at least 6 characters.");
      return;
    }

    if (!window.showDirectoryPicker) {
      setSetupStatus("");
      showSetupToast("error", "Use Chrome or Edge for one-click setup so CostPilot can write project files.");
      return;
    }

    try {
      setSetupRunning(true);
      setSetupStatus("Verifying employee password...");
      setSetupToast(null);
      const login = await requestJson<EmployeeLoginResponse>("/api/auth/employee-login", {
        authMode: "none",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.user.email,
          password
        })
      });
      setEmployeeAccessToken(login.token);

      const verifiedSetup = buildAgentSetups(data.cursorConfig, password).find((item) => item.key === setup.key) ?? setup;
      setSetupStatus("Choose the repo folder where you use this coding agent...");
      showSetupToast("info", "Choose the repo folder where you use this coding agent.");
      const root = await window.showDirectoryPicker();
      for (const file of verifiedSetup.projectFiles) {
        await writeProjectFile(root, file.path, file.contents);
      }
      setSetupStatus(`Setup files added for ${verifiedSetup.name}. Restart the agent or refresh MCP servers.`);
      setPasswordDialogOpen(false);
      setEmployeePassword("");
      showSetupToast("success", `Setup files added for ${verifiedSetup.name}.`);

      if (verifiedSetup.setupHref) {
        window.location.href = verifiedSetup.setupHref;
      }
    } catch (error) {
      setSetupStatus("");
      showSetupToast("error", resolveSetupError(error));
    } finally {
      setSetupRunning(false);
    }
  }

  function signOut() {
    void signOutEmployee({
      signOutClerk: window.Clerk?.loaded ? () => window.Clerk?.signOut?.() : undefined,
      redirectTo: "/employee/login"
    });
  }

  const setupOptions = useMemo(() => (data ? buildAgentSetups(data.cursorConfig, employeePassword) : null), [data, employeePassword]);
  const activeSetup = setupOptions?.find((setup) => setup.key === activeAgent) ?? setupOptions?.[0] ?? null;
  const pendingSetup = setupOptions?.find((setup) => setup.key === pendingSetupKey) ?? activeSetup;

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
            <h1 className="mt-3 font-display text-4xl font-semibold">
              {data ? data.user.fullName : "Loading employee access"}
            </h1>
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

      {data && activeSetup && setupOptions ? (
        <>
          <section className="grid gap-6 md:grid-cols-3">
            <MetricCard label="Requests" value={String(data.usage.totalRequests)} />
            <MetricCard label="Tokens" value={Intl.NumberFormat("en-US").format(data.usage.totalTokens)} />
            <MetricCard label="Spend" value={formatCostUsd(data.usage.totalCostUsd)} detail={`Shown to ${formatCostUsd(0.00001)}`} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(18rem,0.75fr)_minmax(0,1.25fr)]">
            <Card className="p-6">
              <p className="text-sm text-slate-500">Choose your coding agent</p>
              <h2 className="mt-2 font-display text-2xl font-semibold">CostPilot MCP setup</h2>
              <div className="mt-5 grid gap-2">
                {agentOptions.map((agent) => (
                  <button
                    key={agent.key}
                    type="button"
                    onClick={() => {
                      setActiveAgent(agent.key);
                      setSetupStatus("");
                      setSetupToast(null);
                    }}
                    className={cn(
                      "flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition",
                      activeAgent === agent.key
                        ? "border-black bg-black text-white"
                        : "border-black/10 bg-white/70 text-slate-700 hover:bg-white"
                    )}
                  >
                    <span className="font-medium">{agent.name}</span>
                    {activeAgent === agent.key ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                One action writes MCP config and agent rules into your selected project. Claude opens with a setup prompt; Codex has no official browser launcher, so files are written locally.
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-500">{activeSetup.name}</p>
                  <h2 className="mt-2 font-display text-2xl font-semibold">{activeSetup.setupLabel}</h2>
                  <p className="mt-3 max-w-2xl text-sm text-slate-600">{activeSetup.description}</p>
                </div>
                <a
                  href={activeSetup.docsHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-medium text-slate-800"
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Docs
                </a>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => startSetup(activeSetup)}
                  disabled={setupRunning}
                  className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <FolderOpen className="h-4 w-4" aria-hidden="true" />
                  {setupRunning ? "Setting up..." : "Complete setup"}
                </button>
              </div>
              {setupStatus ? <p className="mt-3 text-sm text-slate-600">{setupStatus}</p> : null}

              <ol className="mt-6 grid gap-3 text-sm text-slate-700">
                {activeSetup.steps.map((step, index) => (
                  <li key={step} className="flex gap-3 rounded-2xl bg-white/70 px-4 py-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{activeSetup.verify}</div>
            </Card>
          </section>

          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">Recent usage</p>
                <h2 className="mt-2 font-display text-2xl font-semibold">Latest tracked requests</h2>
              </div>
              <Pill>{data.user.organizationName}</Pill>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {data.recentEvents.length ? (
                data.recentEvents.map((event) => (
                  <div key={event.id} className="rounded-2xl bg-white/80 px-4 py-4 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-medium">{event.model}</p>
                      <span>{formatCostUsd(event.costUsd)}</span>
                    </div>
                    <p className="mt-2 text-slate-500">
                      {event.provider} / {event.category} / {Intl.NumberFormat("en-US").format(event.totalTokens)} tokens
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-black/10 bg-white/70 px-4 py-4 text-sm text-slate-600">
                  No usage events recorded yet for this employee account.
                </div>
              )}
            </div>
          </Card>
        </>
      ) : null}

      {passwordDialogOpen && pendingSetup ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="setup-password-title">
          <div className="w-full max-w-md rounded-3xl border border-black/10 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">{pendingSetup.name}</p>
                <h2 id="setup-password-title" className="mt-1 font-display text-2xl font-semibold text-slate-950">
                  Confirm employee password
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  CostPilot will verify your password, then write MCP config and rules into the project folder you choose.
                </p>
              </div>
              <button
                type="button"
                onClick={closePasswordDialog}
                disabled={setupRunning}
                className="rounded-full border border-black/10 bg-white p-2 text-slate-500 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Close password dialog"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form
              className="mt-5 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void applyProjectFiles(pendingSetup);
              }}
            >
              <label className="grid gap-2 text-sm font-medium text-slate-800">
                <span>Employee password</span>
                <input
                  autoFocus
                  type="password"
                  value={employeePassword}
                  onChange={(event) => setEmployeePassword(event.target.value)}
                  className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-black focus:ring-4 focus:ring-black/5"
                  placeholder="Enter your CostPilot employee password"
                />
              </label>
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                The generated MCP config includes this password for local agent authentication. Keep these files out of public repos.
              </p>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={closePasswordDialog}
                  disabled={setupRunning}
                  className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={setupRunning}
                  className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <FolderOpen className="h-4 w-4" aria-hidden="true" />
                  {setupRunning ? "Setting up..." : "Verify and set up"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {setupToast ? (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-[60] max-w-sm rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl",
            setupToast.tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-950",
            setupToast.tone === "error" && "border-rose-200 bg-rose-50 text-rose-950",
            setupToast.tone === "info" && "border-slate-200 bg-white text-slate-800"
          )}
          role={setupToast.tone === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {setupToast.message}
        </div>
      ) : null}
    </main>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card className="p-6">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-4xl font-semibold">{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </Card>
  );
}

async function writeProjectFile(root: CostPilotDirectoryHandle, path: string, contents: string) {
  const segments = path.split("/").filter(Boolean);
  const fileName = segments.pop();
  if (!fileName) {
    return;
  }

  let directory = root;
  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment, { create: true });
  }

  const file = await directory.getFileHandle(fileName, { create: true });
  const writer = await file.createWritable();
  await writer.write(contents);
  await writer.close();
}

function resolveSetupError(error: unknown) {
  if (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") {
    return "Folder selection was cancelled.";
  }

  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "Invalid employee password.";
    }

    return extractFriendlyMessage(error.payload) ?? normalizeValidationText(error.message);
  }

  if (error instanceof Error) {
    return normalizeValidationText(error.message);
  }

  return "Unable to complete setup. Please try again.";
}

function extractFriendlyMessage(payload: unknown): string | null {
  if (Array.isArray(payload)) {
    return extractFriendlyIssueMessage(payload[0]);
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.issues)) {
    return extractFriendlyIssueMessage(record.issues[0]);
  }

  if (Array.isArray(record.errors)) {
    return extractFriendlyIssueMessage(record.errors[0]);
  }

  if (typeof record.message === "string") {
    return normalizeValidationText(record.message);
  }

  return null;
}

function extractFriendlyIssueMessage(issue: unknown): string | null {
  if (!issue || typeof issue !== "object") {
    return null;
  }

  const record = issue as Record<string, unknown>;
  const path = Array.isArray(record.path) ? record.path.join(".") : "";
  if (path.includes("password") && (record.code === "too_small" || String(record.message ?? "").includes("6 character"))) {
    return "Password must be at least 6 characters.";
  }

  return typeof record.message === "string" ? normalizeValidationText(record.message) : null;
}

function normalizeValidationText(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return "Unable to complete setup. Please try again.";
  }

  if (
    trimmed.includes('"code"') ||
    trimmed.includes("too_small") ||
    trimmed.includes("String must contain at least 6 character")
  ) {
    return "Password must be at least 6 characters.";
  }

  if (/invalid email or password/i.test(trimmed)) {
    return "Invalid employee password.";
  }

  return trimmed;
}

function buildAgentSetups(cursorConfig: CursorMcpConfig, employeePassword = "paste-your-password-here"): AgentSetup[] {
  const server = withEmployeePassword(cursorConfig.mcpServers.costpilot, employeePassword);
  const fullCursorConfig: CursorMcpConfig = {
    mcpServers: {
      costpilot: server
    }
  };
  const cursorSingleServerConfig = JSON.stringify(server);
  const cursorInstallConfig = toBase64(cursorSingleServerConfig);
  const cursorInstallUrl = `cursor://anysphere.cursor-deeplink/mcp/install?name=costpilot&config=${encodeURIComponent(cursorInstallConfig)}`;
  const vsCodeInstallConfig = {
    name: "costpilot",
    type: server.type,
    command: server.command,
    args: server.args,
    env: server.env
  };
  const vsCodeInstallUrl = `vscode:mcp/install?${encodeURIComponent(JSON.stringify(vsCodeInstallConfig))}`;
  const claudeCommand = [
    "claude mcp add --transport stdio --scope user",
    `--env COSTPILOT_API_URL=${shellQuote(server.env.COSTPILOT_API_URL)}`,
    `--env COSTPILOT_EMPLOYEE_EMAIL=${shellQuote(server.env.COSTPILOT_EMPLOYEE_EMAIL)}`,
    `--env COSTPILOT_EMPLOYEE_PASSWORD=${shellQuote(server.env.COSTPILOT_EMPLOYEE_PASSWORD)}`,
    "costpilot --",
    server.command,
    ...server.args.map(shellQuote)
  ].join(" ");
  const copilotConfig = JSON.stringify({ servers: { costpilot: server } }, null, 2);
  const claudeProjectConfig = JSON.stringify({ mcpServers: { costpilot: server } }, null, 2);
  const codexConfig = toCodexToml(server);
  const commonRules = costpilotAgentInstructionsMarkdown;
  const claudeLaunchPrompt = [
    "Set up CostPilot MCP for this project.",
    "",
    "1. Run this command after replacing paste-your-password-here with my employee password:",
    claudeCommand,
    "",
    "2. Create or update CLAUDE.md with the CostPilot MCP instructions from the dashboard.",
    "3. Run /mcp and confirm the costpilot server is connected."
  ].join("\n");
  const claudeLaunchUrl = `claude-cli://open?q=${encodeURIComponent(claudeLaunchPrompt)}`;

  return [
    {
      key: "cursor",
      name: "Cursor",
      description: "Writes Cursor MCP config and project rules, then opens Cursor's MCP install flow when supported.",
      setupLabel: "Complete Cursor setup",
      setupHref: cursorInstallUrl,
      configTitle: ".cursor/mcp.json",
      configText: JSON.stringify(fullCursorConfig, null, 2),
      instructionPath: ".cursor/rules/costpilot-mcp.mdc",
      instructionText: costpilotCursorRulesMdc,
      projectFiles: [
        { path: ".cursor/mcp.json", contents: JSON.stringify(fullCursorConfig, null, 2) },
        { path: ".cursor/rules/costpilot-mcp.mdc", contents: costpilotCursorRulesMdc },
        { path: "rules.md", contents: commonRules }
      ],
      steps: [
        "Click Complete setup, enter your employee password, and choose your repo folder.",
        "CostPilot writes mcp.json, .cursor/mcp.json, .cursor/rules/costpilot-mcp.mdc, and rules.md.",
        "Approve the Cursor setup prompt if it appears, then restart Cursor or refresh MCP servers."
      ],
      verify: "Open Cursor Agent and confirm the costpilot tools are listed under available MCP tools.",
      docsHref: "https://docs.cursor.com/context/mcp"
    },
    {
      key: "claude",
      name: "Claude Code",
      description: "Writes Claude project MCP config and instructions, then opens Claude Code with a prefilled setup prompt.",
      setupLabel: "Complete Claude Code setup",
      setupHref: claudeLaunchUrl,
      configTitle: "Claude Code command",
      configText: `${claudeCommand}\n\nManual project config alternative:\n${claudeProjectConfig}`,
      instructionPath: "CLAUDE.md",
      instructionText: costpilotAgentInstructionsMarkdown,
      projectFiles: [
        { path: ".mcp.json", contents: claudeProjectConfig },
        { path: "CLAUDE.md", contents: costpilotAgentInstructionsMarkdown },
        { path: "rules.md", contents: commonRules }
      ],
      steps: [
        "Click Complete setup, enter your employee password, and choose your repo folder.",
        "CostPilot writes mcp.json, .mcp.json, CLAUDE.md, and rules.md.",
        "Claude opens with the setup prompt; press Enter there if it asks for confirmation."
      ],
      verify: "Run claude mcp list or open /mcp inside Claude Code and confirm costpilot is connected.",
      docsHref: "https://code.claude.com/docs/en/mcp"
    },
    {
      key: "copilot",
      name: "GitHub Copilot",
      description: "Writes VS Code MCP config and Copilot instructions, then opens VS Code's MCP install flow when supported.",
      setupLabel: "Complete GitHub Copilot setup",
      setupHref: vsCodeInstallUrl,
      configTitle: ".vscode/mcp.json",
      configText: copilotConfig,
      instructionPath: ".github/copilot-instructions.md",
      instructionText: costpilotAgentInstructionsMarkdown,
      projectFiles: [
        { path: ".vscode/mcp.json", contents: copilotConfig },
        { path: ".github/copilot-instructions.md", contents: costpilotAgentInstructionsMarkdown },
        { path: "rules.md", contents: commonRules }
      ],
      steps: [
        "Click Complete setup, enter your employee password, and choose your repo folder.",
        "CostPilot writes mcp.json, .vscode/mcp.json, .github/copilot-instructions.md, and rules.md.",
        "Approve the VS Code setup prompt if it appears, then enable costpilot in Copilot Agent mode."
      ],
      verify: "Run MCP: List Servers from the Command Palette and confirm costpilot is running.",
      docsHref: "https://code.visualstudio.com/docs/copilot/reference/mcp-configuration"
    },
    {
      key: "codex",
      name: "OpenAI Codex",
      description: "Writes Codex project instructions and a Codex MCP config file. Codex does not currently provide an official browser setup URL.",
      setupLabel: "Complete Codex setup",
      configTitle: ".codex/config.toml",
      configText: codexConfig,
      instructionPath: "AGENTS.md",
      instructionText: costpilotAgentInstructionsMarkdown,
      projectFiles: [
        { path: ".codex/config.toml", contents: codexConfig },
        { path: "AGENTS.md", contents: costpilotAgentInstructionsMarkdown },
        { path: "rules.md", contents: commonRules }
      ],
      steps: [
        "Click Complete setup, enter your employee password, and choose your repo folder.",
        "CostPilot writes mcp.json, .codex/config.toml, AGENTS.md, and rules.md.",
        "Restart Codex or start a new Codex session in that project."
      ],
      verify: "Run codex mcp list or open /mcp in Codex and confirm costpilot is connected.",
      docsHref: "https://platform.openai.com/docs/docs-mcp"
    }
  ];
}

function toBase64(value: string) {
  if (typeof window === "undefined") {
    return "";
  }

  return window.btoa(value);
}

function shellQuote(value: string) {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}

function toCodexToml(server: McpServerConfig) {
  return `[mcp_servers.costpilot]
command = ${tomlString(server.command)}
args = [${server.args.map(tomlString).join(", ")}]
enabled = true

[mcp_servers.costpilot.env]
COSTPILOT_API_URL = ${tomlString(server.env.COSTPILOT_API_URL)}
COSTPILOT_EMPLOYEE_EMAIL = ${tomlString(server.env.COSTPILOT_EMPLOYEE_EMAIL)}
COSTPILOT_EMPLOYEE_PASSWORD = ${tomlString(server.env.COSTPILOT_EMPLOYEE_PASSWORD)}
`;
}

function tomlString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function withEmployeePassword(server: McpServerConfig, password: string): McpServerConfig {
  return {
    ...server,
    env: {
      ...server.env,
      COSTPILOT_EMPLOYEE_PASSWORD: password
    }
  };
}
