"use client";

import { useEffect, useState } from "react";
import { Card, Pill } from "./ui";
import { buildAuthHeaders, getApiBase } from "../lib/api";

type PolicyRecord = {
  id: string;
  role: string;
  category: string;
  feature?: string | null;
  allowedModels: string[];
  actionOnViolation: string;
  maxRequestsPerHour?: number | null;
  maxTokensPerDay?: number | null;
};

export function PolicyManager() {
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [role, setRole] = useState("SDE1");
  const [category, setCategory] = useState("email_generation");
  const [feature, setFeature] = useState("auto_reply");
  const [allowedModels, setAllowedModels] = useState("gpt-4o-mini,gpt-4.1-mini");
  const [action, setAction] = useState("WARN");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const response = await fetch(`${getApiBase()}/api/policies`, {
      headers: buildAuthHeaders()
    });
    const payload = (await response.json()) as PolicyRecord[];
    setPolicies(payload);
  }

  async function createPolicy() {
    const response = await fetch(`${getApiBase()}/api/policies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders()
      },
      body: JSON.stringify({
        role,
        category,
        feature,
        allowedModels: allowedModels.split(",").map((item) => item.trim()).filter(Boolean),
        actionOnViolation: action,
        maxTokensPerDay: 10000,
        maxRequestsPerHour: 5,
        cooldownMinutes: 15,
        featureLocked: role === "INTERN" && category === "code_generation"
      })
    });

    if (response.ok) {
      await load();
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Policy Dashboard</p>
            <h2 className="font-display text-3xl font-semibold">Create limits by role, category, and feature</h2>
          </div>
          <Pill tone="warn">Real-time enforcement</Pill>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-5">
          <select value={role} onChange={(event) => setRole(event.target.value)} className="rounded-xl border border-black/10 px-3 py-2">
            {["ADMIN", "MANAGER", "SDE1", "SDE2", "INTERN"].map((entry) => <option key={entry}>{entry}</option>)}
          </select>
          <input value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-xl border border-black/10 px-3 py-2" />
          <input value={feature} onChange={(event) => setFeature(event.target.value)} className="rounded-xl border border-black/10 px-3 py-2" />
          <input value={allowedModels} onChange={(event) => setAllowedModels(event.target.value)} className="rounded-xl border border-black/10 px-3 py-2" />
          <select value={action} onChange={(event) => setAction(event.target.value)} className="rounded-xl border border-black/10 px-3 py-2">
            {["BLOCK", "WARN", "THROTTLE"].map((entry) => <option key={entry}>{entry}</option>)}
          </select>
        </div>
        <button onClick={() => void createPolicy()} className="mt-4 rounded-full bg-black px-5 py-2 text-sm font-medium text-white">
          Create Policy
        </button>
      </Card>

      <Card className="p-6">
        <div className="space-y-3">
          {policies.map((policy) => (
            <div key={policy.id} className="grid gap-3 rounded-[20px] border border-black/10 bg-white/80 px-4 py-4 md:grid-cols-5">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Role</p>
                <p className="mt-1 font-medium">{policy.role}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Category</p>
                <p className="mt-1 font-medium">{policy.category}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Feature</p>
                <p className="mt-1 font-medium">{policy.feature ?? "all"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Models</p>
                <p className="mt-1 font-medium">{policy.allowedModels.join(", ")}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Action</p>
                <p className="mt-1 font-medium">{policy.actionOnViolation}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
