"use client";

import { useEffect, useState } from "react";
import { Card, Pill } from "./ui";
import { buildAuthHeaders, getApiBase, setStoredDemoToken } from "../lib/api";

type SessionPayload = {
  authMode: "demo" | "clerk";
  user: {
    userId: string;
    role: string;
    teamId?: string | null;
    name?: string;
    email?: string;
  };
  availableRoles: string[];
  availableTeams: Array<{ id: string; name: string }>;
};

export function DemoModePanel() {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [role, setRole] = useState("ADMIN");
  const [teamId, setTeamId] = useState("");
  const [status, setStatus] = useState("Loading session...");

  useEffect(() => {
    void loadSession();
  }, []);

  async function loadSession() {
    const response = await fetch(`${getApiBase()}/api/auth/session`, {
      headers: {
        ...buildAuthHeaders()
      }
    });
    const payload = (await response.json()) as SessionPayload;
    setSession(payload);
    setRole(payload.user.role);
    setTeamId(payload.user.teamId ?? payload.availableTeams[0]?.id ?? "");
    setStatus(`${payload.authMode.toUpperCase()} mode active`);
  }

  async function handleLogin() {
    const response = await fetch(`${getApiBase()}/api/auth/demo-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        role,
        teamId,
        userId: `demo-${role.toLowerCase()}`,
        email: `${role.toLowerCase()}@demo.costpilot.ai`,
        name: `Demo ${role}`
      })
    });
    const payload = (await response.json()) as { token: string };
    setStoredDemoToken(payload.token);
    await loadSession();
    setStatus(`Logged in as ${role}`);
  }

  async function handleLogout() {
    setStoredDemoToken("");
    await fetch(`${getApiBase()}/api/auth/logout`, { method: "POST" });
    await loadSession();
    setStatus("Demo session reset");
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Authentication Mode</p>
          <h2 className="font-display text-2xl font-semibold">Demo login and role switching</h2>
        </div>
        <Pill tone="warn">{session?.authMode ?? "demo"}</Pill>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        Demo mode injects a mock user and lets you switch role and team instantly. In production, switch `AUTH_MODE=clerk`.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="rounded-[20px] bg-white/80 p-4 text-sm">
          <span className="mb-2 block text-slate-500">Role</span>
          <select value={role} onChange={(event) => setRole(event.target.value)} className="w-full rounded-xl border border-black/10 bg-white px-3 py-2">
            {(session?.availableRoles ?? ["ADMIN", "MANAGER", "SDE1", "SDE2", "INTERN"]).map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
        <label className="rounded-[20px] bg-white/80 p-4 text-sm">
          <span className="mb-2 block text-slate-500">Team</span>
          <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="w-full rounded-xl border border-black/10 bg-white px-3 py-2">
            {(session?.availableTeams ?? []).map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button onClick={() => void handleLogin()} className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white">
          Login With Demo Role
        </button>
        <button onClick={() => void handleLogout()} className="rounded-full border border-black/10 bg-white px-5 py-2 text-sm font-medium">
          Logout
        </button>
      </div>
      <div className="mt-5 rounded-[20px] bg-stone-100 px-4 py-3 text-sm text-slate-600">
        <p className="font-medium text-slate-900">Current user</p>
        <p className="mt-1">{session?.user.name ?? "Demo Admin"} · {session?.user.role ?? "ADMIN"}</p>
        <p className="mt-2">{status}</p>
      </div>
    </Card>
  );
}

