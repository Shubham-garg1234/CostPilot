import { ShieldCheck, Sparkles, Wallet, Zap } from "lucide-react";
import { DemoModePanel } from "../components/demo-mode-panel";
import { ProxyPlayground } from "../components/proxy-playground";
import { Card, Pill } from "../components/ui";
import { alerts, policyRows, summaryCards, teamBreakdown } from "../lib/data";

const heatmap = [
  ["Mon", 28, 34, 55, 60, 42],
  ["Tue", 26, 29, 52, 71, 49],
  ["Wed", 20, 31, 48, 68, 57],
  ["Thu", 17, 23, 41, 66, 61],
  ["Fri", 14, 20, 33, 58, 54]
];

export default function HomePage() {
  return (
    <main className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
        <Card className="overflow-hidden p-8">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <Pill>Governed LLM Operations</Pill>
              <h1 className="mt-4 max-w-2xl font-display text-4xl font-semibold leading-tight md:text-6xl">
                One control plane for LLM usage, cost, and policy enforcement.
              </h1>
            </div>
            <div className="rounded-[28px] border border-black/10 bg-black px-5 py-4 text-white">
              <p className="text-xs uppercase tracking-[0.24em] text-white/60">Proxy Status</p>
              <p className="mt-2 text-3xl font-semibold">99.98%</p>
              <p className="text-sm text-white/70">Requests processed with guardrails in real time</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            {summaryCards.map((card, index) => (
              <div
                key={card.label}
                className={`rounded-[24px] p-5 ${index === 0 ? "bg-teal-900 text-white" : "bg-white/80 text-slate-800"}`}
              >
                <p className="text-sm opacity-70">{card.label}</p>
                <p className="mt-3 text-3xl font-semibold">{card.value}</p>
                <p className="mt-2 text-sm">{card.delta}</p>
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
              <p className="text-sm text-slate-500">Live Governance</p>
              <p className="font-display text-2xl font-semibold">Policy Engine</p>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            {[
              "Role-aware model allowlists",
              "Feature locking by category",
              "Redis-backed hourly and daily counters",
              "Cooldowns, warnings, and temporary bans"
            ].map((item) => (
              <div key={item} className="rounded-[22px] border border-black/10 bg-white/70 px-4 py-3 text-sm text-slate-700">
                {item}
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] bg-amber-100 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-800">Role Lock</p>
              <p className="mt-2 text-sm text-amber-950">Interns cannot access code generation or premium models.</p>
            </div>
            <div className="rounded-[22px] bg-emerald-100 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-800">Optimization</p>
              <p className="mt-2 text-sm text-emerald-950">Junior workflows are nudged to lower-cost tiers.</p>
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Usage Heatmap</p>
              <h2 className="font-display text-2xl font-semibold">Peak cost windows by weekday</h2>
            </div>
            <Pill tone="warn">Top expensive feature: auto_reply</Pill>
          </div>
          <div className="space-y-3">
            {heatmap.map(([day, ...cells]) => (
              <div key={day as string} className="grid grid-cols-[60px_repeat(5,minmax(0,1fr))] gap-3">
                <div className="self-center text-sm font-medium text-slate-600">{day}</div>
                {cells.map((value, index) => (
                  <div
                    key={`${day}-${index}`}
                    className="h-16 rounded-[18px]"
                    style={{ background: `rgba(15, 118, 110, ${Number(value) / 90})` }}
                  />
                ))}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Cost by Team</p>
              <h2 className="font-display text-2xl font-semibold">Who is spending and where</h2>
            </div>
            <Wallet className="h-5 w-5 text-slate-500" />
          </div>
          <div className="space-y-3">
            {teamBreakdown.map((row) => (
              <div key={row.team} className="grid grid-cols-[1.2fr_1fr_1fr_1fr] items-center rounded-[20px] bg-white/70 px-4 py-3 text-sm">
                <span className="font-medium">{row.team}</span>
                <span>{row.cost}</span>
                <span>{row.tokens}</span>
                <span className="text-slate-500">{row.role}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Policy Matrix</p>
              <h2 className="font-display text-2xl font-semibold">Restrictions by role and feature</h2>
            </div>
            <Zap className="h-5 w-5 text-slate-500" />
          </div>
          <div className="space-y-3">
            {policyRows.map((row) => (
              <div key={`${row.role}-${row.category}`} className="grid gap-3 rounded-[22px] border border-black/10 bg-white/70 px-4 py-4 md:grid-cols-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Role</p>
                  <p className="mt-1 font-medium">{row.role}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Category</p>
                  <p className="mt-1 font-medium">{row.category}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Feature</p>
                  <p className="mt-1 font-medium">{row.feature}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Models</p>
                  <p className="mt-1 font-medium">{row.models}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Action</p>
                  <p className="mt-1 font-medium">{row.action} · {row.limit}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-teal-800" />
            <div>
              <p className="text-sm text-slate-500">AI Optimization Layer</p>
              <h2 className="font-display text-2xl font-semibold">Savings suggestions</h2>
            </div>
          </div>
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div key={alert.title} className="rounded-[22px] bg-white/75 p-4">
                <Pill tone={alert.severity === "critical" ? "danger" : alert.severity === "warning" ? "warn" : "default"}>
                  {alert.severity}
                </Pill>
                <p className="mt-3 font-medium">{alert.title}</p>
                <p className="mt-2 text-sm text-slate-600">{alert.detail}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <DemoModePanel />
        <ProxyPlayground />
      </section>
    </main>
  );
}
