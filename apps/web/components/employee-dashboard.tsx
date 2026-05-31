"use client";

import { CheckCircle2, Clipboard, ExternalLink, FileText, Terminal } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  costpilotAgentInstructionsMarkdown,
  costpilotCursorRulesMdc
} from "../lib/costpilot-employee-mcp-content";
import { ApiError, clearEmployeeAccessToken, getEmployeeAccessToken, requestJson } from "../lib/api";
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

type AgentSetup = {
  key: AgentKey;
  name: string;
  description: string;
  setupLabel: string;
  setupHref?: string;
  setupCommand?: string;
  configTitle: string;
  configText: string;
  instructionPath: string;
  instructionText: string;
  steps: string[];
  verify: string;
  docsHref: string;
};

const agentOptions: Array<{ key: AgentKey; name: string }> = [
  { key: "cursor", name: "Cursor" },
  { key: "claude", name: "Claude Code" },
  { key: "copilot", name: "GitHub Copilot" },
  { key: "codex", name: "OpenAI Codex" }
];

export function EmployeeDashboard() {
  const [data, setData] = useState<EmployeeDashboardPayload | null>(null);
  const [status, setStatus] = useState("Loading your employee dashboard...");
  const [copyStatus, setCopyStatus] = useState("");
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

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(`${label} copied.`);
    } catch {
      setCopyStatus("Unable to copy automatically. Select the text and copy it manually.");
    }
  }

  function signOut() {
    void signOutEmployee({
      signOutClerk: window.Clerk?.loaded ? () => window.Clerk?.signOut?.() : undefined,
      redirectTo: "/employee/login"
    });
  }

  const setupOptions = useMemo(() => (data ? buildAgentSetups(data.cursorConfig) : null), [data]);
  const activeSetup = setupOptions?.find((setup) => setup.key === activeAgent) ?? setupOptions?.[0] ?? null;

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
                      setCopyStatus("");
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
                Browser setup can open Cursor or VS Code install flows. Claude Code and Codex require one copied terminal command.
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
                {activeSetup.setupHref ? (
                  <a
                    href={activeSetup.setupHref}
                    className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white"
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    Open setup
                  </a>
                ) : null}
                {activeSetup.setupCommand ? (
                  <button
                    type="button"
                    onClick={() => void copyText("Setup command", activeSetup.setupCommand ?? "")}
                    className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white"
                  >
                    <Terminal className="h-4 w-4" aria-hidden="true" />
                    Copy setup command
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void copyText(activeSetup.configTitle, activeSetup.configText)}
                  className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-medium text-slate-800"
                >
                  <Clipboard className="h-4 w-4" aria-hidden="true" />
                  Copy config
                </button>
                <button
                  type="button"
                  onClick={() => void copyText(activeSetup.instructionPath, activeSetup.instructionText)}
                  className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-medium text-slate-800"
                >
                  <Clipboard className="h-4 w-4" aria-hidden="true" />
                  Copy instructions
                </button>
              </div>
              {copyStatus ? <p className="mt-3 text-sm text-slate-600">{copyStatus}</p> : null}

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

          <section className="grid gap-6 xl:grid-cols-2">
            <Card className="p-6">
              <p className="text-sm text-slate-500">{activeSetup.configTitle}</p>
              <h2 className="mt-2 font-display text-2xl font-semibold">MCP config</h2>
              <p className="mt-3 text-sm text-slate-600">
                Replace <code className="rounded bg-black/5 px-1 py-0.5">paste-your-password-here</code> with your employee password before saving.
              </p>
              <pre className="mt-5 max-h-[min(28rem,50vh)] overflow-auto rounded-2xl bg-stone-950 p-4 text-xs text-stone-100 whitespace-pre-wrap">
                {activeSetup.configText}
              </pre>
            </Card>

            <Card className="p-6">
              <p className="text-sm text-slate-500">{activeSetup.instructionPath}</p>
              <h2 className="mt-2 font-display text-2xl font-semibold">Agent instructions</h2>
              <p className="mt-3 text-sm text-slate-600">
                Add this file in the repo where you use the agent so CostPilot tools are used consistently.
              </p>
              <pre className="mt-5 max-h-[min(28rem,50vh)] overflow-auto rounded-2xl bg-stone-950 p-4 text-xs text-stone-100 whitespace-pre-wrap">
                {activeSetup.instructionText}
              </pre>
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

function buildAgentSetups(cursorConfig: CursorMcpConfig): AgentSetup[] {
  const server = cursorConfig.mcpServers.costpilot;
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
  const codexCommand = [
    "codex mcp add costpilot",
    `--env COSTPILOT_API_URL=${shellQuote(server.env.COSTPILOT_API_URL)}`,
    `--env COSTPILOT_EMPLOYEE_EMAIL=${shellQuote(server.env.COSTPILOT_EMPLOYEE_EMAIL)}`,
    `--env COSTPILOT_EMPLOYEE_PASSWORD=${shellQuote(server.env.COSTPILOT_EMPLOYEE_PASSWORD)}`,
    "--",
    server.command,
    ...server.args.map(shellQuote)
  ].join(" ");
  const copilotConfig = JSON.stringify({ servers: { costpilot: server } }, null, 2);
  const codexConfig = toCodexToml(server);

  return [
    {
      key: "cursor",
      name: "Cursor",
      description: "The setup button opens Cursor's MCP install flow when Cursor is installed. If the prompt does not open, copy the config manually.",
      setupLabel: "Open Cursor and install CostPilot",
      setupHref: cursorInstallUrl,
      configTitle: "~/.cursor/mcp.json",
      configText: JSON.stringify(cursorConfig, null, 2),
      instructionPath: ".cursor/rules/costpilot-mcp.mdc",
      instructionText: costpilotCursorRulesMdc,
      steps: [
        "Click Open setup and approve the CostPilot MCP server in Cursor.",
        "Replace paste-your-password-here with your employee password if Cursor asks you to review the config.",
        "In your repo, create .cursor/rules/costpilot-mcp.mdc and paste the copied instructions.",
        "Restart Cursor or refresh MCP servers from Cursor Settings > MCP."
      ],
      verify: "Open Cursor Agent and confirm the costpilot tools are listed under available MCP tools.",
      docsHref: "https://docs.cursor.com/context/mcp"
    },
    {
      key: "claude",
      name: "Claude Code",
      description: "Claude Code setup runs through the claude CLI, which updates the MCP configuration for you.",
      setupLabel: "Copy the Claude Code command",
      setupCommand: claudeCommand,
      configTitle: "Claude Code command",
      configText: `${claudeCommand}\n\nManual project config alternative:\n${JSON.stringify(cursorConfig, null, 2)}`,
      instructionPath: "CLAUDE.md",
      instructionText: costpilotAgentInstructionsMarkdown,
      steps: [
        "Open a terminal in the project where you use Claude Code.",
        "Run the copied command after replacing paste-your-password-here with your employee password.",
        "Create CLAUDE.md in the project root and paste the copied instructions.",
        "Start Claude Code from that project."
      ],
      verify: "Run claude mcp list or open /mcp inside Claude Code and confirm costpilot is connected.",
      docsHref: "https://code.claude.com/docs/en/mcp"
    },
    {
      key: "copilot",
      name: "GitHub Copilot",
      description: "The setup button opens VS Code's MCP install flow for Copilot Agent mode. Manual config uses .vscode/mcp.json.",
      setupLabel: "Open VS Code and install CostPilot",
      setupHref: vsCodeInstallUrl,
      configTitle: ".vscode/mcp.json",
      configText: copilotConfig,
      instructionPath: ".github/copilot-instructions.md",
      instructionText: costpilotAgentInstructionsMarkdown,
      steps: [
        "Click Open setup and approve the server in VS Code.",
        "If VS Code does not open, create .vscode/mcp.json and paste the copied config.",
        "Create .github/copilot-instructions.md in the repo and paste the copied instructions.",
        "Open Copilot Chat, switch to Agent mode, and enable costpilot in the tools picker."
      ],
      verify: "Run MCP: List Servers from the Command Palette and confirm costpilot is running.",
      docsHref: "https://code.visualstudio.com/docs/copilot/reference/mcp-configuration"
    },
    {
      key: "codex",
      name: "OpenAI Codex",
      description: "Codex setup runs through the codex CLI and stores MCP settings in the shared Codex config.",
      setupLabel: "Copy the Codex command",
      setupCommand: codexCommand,
      configTitle: "~/.codex/config.toml",
      configText: codexConfig,
      instructionPath: "AGENTS.md",
      instructionText: costpilotAgentInstructionsMarkdown,
      steps: [
        "Open a terminal where the codex CLI is available.",
        "Run the copied command after replacing paste-your-password-here with your employee password.",
        "Create AGENTS.md in the project root and paste the copied instructions.",
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
