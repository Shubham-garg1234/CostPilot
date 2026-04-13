"use client";

import { useEffect, useState } from "react";
import { Card, Pill } from "./ui";
import { buildAuthHeaders, getApiBase } from "../lib/api";

type OrganizationSnapshot = {
  organization: { id: string; name: string; slug: string; createdAt: string };
  teams: Array<{ id: string; name: string; departmentCode?: string | null; userCount: number }>;
  users: Array<{ id: string; email: string; name: string; role: string; teamId?: string | null }>;
};

export function OrganizationManager() {
  const [snapshot, setSnapshot] = useState<OrganizationSnapshot | null>(null);
  const [orgName, setOrgName] = useState("Northstar Labs");
  const [orgSlug, setOrgSlug] = useState("northstar-labs");
  const [teamName, setTeamName] = useState("AI Enablement");
  const [userName, setUserName] = useState("Rina Engineer");
  const [userEmail, setUserEmail] = useState("rina@northstar.ai");
  const [userRole, setUserRole] = useState("SDE1");
  const [status, setStatus] = useState("Loading organization...");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const response = await fetch(`${getApiBase()}/api/organizations/current`, {
      headers: buildAuthHeaders()
    });
    const payload = (await response.json()) as OrganizationSnapshot;
    setSnapshot(payload);
    setStatus(`Loaded ${payload.organization.name}`);
  }

  async function createOrganization() {
    const response = await fetch(`${getApiBase()}/api/organizations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders()
      },
      body: JSON.stringify({ name: orgName, slug: orgSlug })
    });
    if (response.ok) {
      setStatus(`Created organization ${orgName}`);
    }
  }

  async function createTeam() {
    if (!snapshot) {
      return;
    }

    const response = await fetch(`${getApiBase()}/api/teams`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders()
      },
      body: JSON.stringify({
        organizationId: snapshot.organization.id,
        name: teamName
      })
    });
    if (response.ok) {
      setStatus(`Created team ${teamName}`);
      await load();
    }
  }

  async function createUser() {
    if (!snapshot) {
      return;
    }

    const response = await fetch(`${getApiBase()}/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders()
      },
      body: JSON.stringify({
        organizationId: snapshot.organization.id,
        teamId: snapshot.teams[0]?.id,
        fullName: userName,
        email: userEmail,
        role: userRole
      })
    });
    if (response.ok) {
      setStatus(`Added ${userName}`);
      await load();
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Organization Dashboard</p>
            <h1 className="font-display text-4xl font-semibold">{snapshot?.organization.name ?? "Organization"}</h1>
          </div>
          <Pill>{snapshot?.organization.slug ?? "demo-org"}</Pill>
        </div>
        <p className="mt-4 text-sm text-slate-600">{status}</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <label className="rounded-[20px] bg-white/80 p-4 text-sm">
            <span className="mb-2 block text-slate-500">Org name</span>
            <input value={orgName} onChange={(event) => setOrgName(event.target.value)} className="w-full rounded-xl border border-black/10 px-3 py-2" />
          </label>
          <label className="rounded-[20px] bg-white/80 p-4 text-sm">
            <span className="mb-2 block text-slate-500">Org slug</span>
            <input value={orgSlug} onChange={(event) => setOrgSlug(event.target.value)} className="w-full rounded-xl border border-black/10 px-3 py-2" />
          </label>
          <div className="flex items-end">
            <button onClick={() => void createOrganization()} className="w-full rounded-full bg-black px-5 py-3 text-sm font-medium text-white">
              Create Organization
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-3">
          {snapshot?.teams.map((team) => (
            <div key={team.id} className="grid grid-cols-[1.4fr_1fr_auto] items-center rounded-[18px] bg-white/75 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{team.name}</p>
                <p className="text-slate-500">{team.departmentCode ?? "General"}</p>
              </div>
              <span>{team.userCount} users</span>
              <Pill>{team.id}</Pill>
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-6">
        <Card className="p-6">
          <p className="text-sm text-slate-500">Create team</p>
          <div className="mt-4 flex gap-3">
            <input value={teamName} onChange={(event) => setTeamName(event.target.value)} className="flex-1 rounded-xl border border-black/10 px-3 py-2" />
            <button onClick={() => void createTeam()} className="rounded-full bg-teal-900 px-5 py-2 text-sm font-medium text-white">
              Add Team
            </button>
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-sm text-slate-500">Add employee</p>
          <div className="mt-4 grid gap-3">
            <input value={userName} onChange={(event) => setUserName(event.target.value)} className="rounded-xl border border-black/10 px-3 py-2" />
            <input value={userEmail} onChange={(event) => setUserEmail(event.target.value)} className="rounded-xl border border-black/10 px-3 py-2" />
            <select value={userRole} onChange={(event) => setUserRole(event.target.value)} className="rounded-xl border border-black/10 px-3 py-2">
              {["ADMIN", "MANAGER", "SDE1", "SDE2", "INTERN"].map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button onClick={() => void createUser()} className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white">
              Add User
            </button>
          </div>
          <div className="mt-5 space-y-2">
            {snapshot?.users.map((user) => (
              <div key={user.id} className="rounded-[18px] bg-stone-100 px-4 py-3 text-sm">
                <p className="font-medium">{user.name}</p>
                <p className="text-slate-500">{user.email} · {user.role}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

