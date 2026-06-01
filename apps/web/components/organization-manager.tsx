"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Card, Pill } from "./ui";
import { ApiError, requestJson } from "../lib/api";
import { useOrganizationWorkspace } from "./organization-workspace-provider";

export function OrganizationManager() {
  const { isLoaded, isSignedIn } = useAuth();
  const { organization: organizationSlice, ensureOrganization } = useOrganizationWorkspace();
  const snapshot = organizationSlice.data;
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [teamName, setTeamName] = useState("AI Enablement");
  const [departmentCode, setDepartmentCode] = useState("AI");
  const [userName, setUserName] = useState("Rina Engineer");
  const [userEmail, setUserEmail] = useState("rina@northstar.ai");
  const [userRole, setUserRole] = useState("SDE1");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedManagerId, setSelectedManagerId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [status, setStatus] = useState("Checking your workspace...");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      setStatus("Sign in through organization login to create or manage your organization.");
      return;
    }

    void ensureOrganization().then((payload) => {
      if (payload) {
        setOrgName((current) => current || payload.organization.name);
        setOrgSlug((current) => current || payload.organization.slug);
        setStatus(`Loaded ${payload.organization.name}`);
      } else if (organizationSlice.error) {
        setStatus(organizationSlice.error);
      }
    });
  }, [isLoaded, isSignedIn, ensureOrganization, organizationSlice.error]);

  useEffect(() => {
    if (slugTouched) {
      return;
    }

    setOrgSlug(slugify(orgName));
  }, [orgName, slugTouched]);

  useEffect(() => {
    if (!snapshot?.teams.length) {
      setSelectedTeamId("");
      return;
    }

    setSelectedTeamId((current) => (current && snapshot.teams.some((team) => team.id === current) ? current : snapshot.teams[0]?.id ?? ""));
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot?.users.length) {
      setSelectedManagerId("");
      return;
    }

    setSelectedManagerId((current) =>
      current && snapshot.users.some((user) => user.id === current && isManagerRole(user.role)) ? current : ""
    );
  }, [snapshot]);

  async function refreshOrganization() {
    const payload = await ensureOrganization({ force: true });
    if (payload) {
      setOrgName((current) => current || payload.organization.name);
      setOrgSlug((current) => current || payload.organization.slug);
      setStatus(`Loaded ${payload.organization.name}`);
    } else if (organizationSlice.error) {
      setStatus(organizationSlice.error);
    }
  }

  async function createOrganization() {
    if (!isSignedIn) {
      setStatus("Sign in before saving organization details.");
      return;
    }

    try {
      setSubmitting(true);
      const payload = await requestJson<{ name: string; created?: boolean }>("/api/organizations", {
        authMode: "clerk",
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name: orgName, slug: orgSlug })
      });
      setStatus(payload.created ? `Created organization ${payload.name}` : `Saved organization details for ${payload.name}`);
      await refreshOrganization();
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : "Unable to save organization details.");
    } finally {
      setSubmitting(false);
    }
  }

  async function createTeam() {
    if (!isSignedIn || !snapshot) {
      setStatus("Load your organization before creating a team.");
      return;
    }

    try {
      setSubmitting(true);
      await requestJson("/api/teams", {
        authMode: "clerk",
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: teamName,
          departmentCode: departmentCode || undefined
        })
      });
      setStatus(`Created team ${teamName}`);
      await refreshOrganization();
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : "Unable to create team.");
    } finally {
      setSubmitting(false);
    }
  }

  async function createUser() {
    if (!isSignedIn || !snapshot) {
      setStatus("Load your organization before adding a user.");
      return;
    }

    if (!selectedTeamId) {
      setStatus("Create a team first, then assign the employee to that team.");
      return;
    }

    try {
      setSubmitting(true);
      const payload = await requestJson<{ temporaryPassword?: string; emailDelivered?: boolean; emailDeliveryNote?: string }>("/api/users", {
        authMode: "clerk",
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          teamId: selectedTeamId,
          fullName: userName,
          email: userEmail,
          role: userRole,
          managerId: selectedManagerId || undefined
        })
      });
      setStatus(
        payload.emailDelivered
          ? `Added ${userName}. Credentials were emailed automatically.`
          : `Added ${userName}. Temporary password: ${payload.temporaryPassword ?? "generated"}. ${payload.emailDeliveryNote ?? ""}`.trim()
      );
      await refreshOrganization();
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : "Unable to add user.");
    } finally {
      setSubmitting(false);
    }
  }

  const signedOut = isLoaded && !isSignedIn;
  const organizationLocked = snapshot
    ? snapshot.teams.length > 0 || snapshot.users.length > 1 || snapshot.policies.length > 0
    : false;
  const currentSlug = snapshot?.organization.slug ?? (signedOut ? "signed-out" : "no-organization");
  const managerOptions = snapshot?.users.filter((user) => isManagerRole(user.role)) ?? [];
  const filteredUsers =
    snapshot?.users.filter((user) => {
      const query = userSearch.trim().toLowerCase();
      if (!query) {
        return true;
      }

      return [user.name, user.email, user.role, user.managerName ?? ""].some((value) => value.toLowerCase().includes(query));
    }) ?? [];
  const loadingWorkspace = organizationSlice.status === "loading" || submitting;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Organization Dashboard</p>
            <h1 className="font-display text-4xl font-semibold">
              {snapshot?.organization.name ?? (signedOut ? "Sign in required" : "Set up your organization")}
            </h1>
          </div>
          <Pill>{currentSlug}</Pill>
        </div>
        <p className="mt-4 text-sm text-slate-600">{status}</p>
        {signedOut ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-black/10 bg-white/70 px-4 py-4 text-sm text-slate-600">
            Use the dedicated <Link href="/organization/login" className="font-medium text-slate-900 underline">organization login</Link> route
            to enter the admin workspace.
          </div>
        ) : null}
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <label className="rounded-[20px] bg-white/80 p-4 text-sm">
            <span className="mb-2 block text-slate-500">Org name</span>
            <input
              value={orgName}
              onChange={(event) => setOrgName(event.target.value)}
              disabled={organizationLocked}
              className="w-full rounded-xl border border-black/10 px-3 py-2 disabled:bg-stone-100"
              placeholder="Acme AI"
            />
          </label>
          <label className="rounded-[20px] bg-white/80 p-4 text-sm">
            <span className="mb-2 block text-slate-500">Org slug</span>
            <input
              value={orgSlug}
              onChange={(event) => {
                setSlugTouched(true);
                setOrgSlug(slugify(event.target.value));
              }}
              disabled={organizationLocked}
              className="w-full rounded-xl border border-black/10 px-3 py-2 disabled:bg-stone-100"
              placeholder="acme-ai"
            />
          </label>
          <div className="flex items-end">
            <button
              onClick={() => void createOrganization()}
              disabled={!isSignedIn || organizationLocked || submitting || orgName.trim().length < 2 || orgSlug.trim().length < 2}
              className="w-full rounded-full bg-black px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {snapshot ? "Save Organization" : "Create Organization"}
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {organizationLocked
            ? "Organization name and slug are locked for now after setup."
            : "Set the organization name and slug first. You can add teams and employees after that."}
        </p>

        <div className="mt-8 grid gap-3">
          {snapshot?.teams.length ? (
            snapshot.teams.map((team) => (
              <div key={team.id} className="grid grid-cols-[1.4fr_1fr_auto] items-center rounded-[18px] bg-white/75 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{team.name}</p>
                  <p className="text-slate-500">{team.departmentCode ?? "General"}</p>
                </div>
                <span>{team.userCount} users</span>
                <Pill>{team.id}</Pill>
              </div>
            ))
          ) : (
            <div className="rounded-[18px] border border-dashed border-black/10 bg-white/70 px-4 py-4 text-sm text-slate-600">
              {signedOut ? "Sign in to see your teams." : "No teams yet. Add your first team and it will appear here."}
            </div>
          )}
        </div>
      </Card>

      <div className="order-first space-y-6 xl:order-none">
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Add employee</p>
              <h2 className="font-display text-2xl font-semibold">Create employee access</h2>
            </div>
            {loadingWorkspace ? <Pill tone="warn">Saving...</Pill> : null}
          </div>
          {loadingWorkspace ? <LoadingShimmer /> : null}
          <div className="mt-4 grid gap-3">
            <input value={userName} onChange={(event) => setUserName(event.target.value)} className="rounded-xl border border-black/10 px-3 py-2" placeholder="Employee name" />
            <input value={userEmail} onChange={(event) => setUserEmail(event.target.value)} className="rounded-xl border border-black/10 px-3 py-2" placeholder="employee@company.com" />
            <label className="grid gap-2 text-sm text-slate-600">
              <span>Select team</span>
              <select
                value={selectedTeamId}
                onChange={(event) => setSelectedTeamId(event.target.value)}
                className="rounded-xl border border-black/10 px-3 py-2"
                disabled={!snapshot?.teams.length}
              >
                <option value="">{snapshot?.teams.length ? "Select team" : "Create a team first"}</option>
                {snapshot?.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}{team.departmentCode ? ` (${team.departmentCode})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm text-slate-600">
              <span>Manager</span>
              <select
                value={selectedManagerId}
                onChange={(event) => setSelectedManagerId(event.target.value)}
                className="rounded-xl border border-black/10 px-3 py-2"
              >
                <option value="">{managerOptions.length ? "No manager" : "Add a manager first"}</option>
                {managerOptions.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name} ({manager.role})
                  </option>
                ))}
              </select>
            </label>
            <select value={userRole} onChange={(event) => setUserRole(event.target.value)} className="rounded-xl border border-black/10 px-3 py-2">
              {["ADMIN", "MANAGER", "SDE1", "SDE2", "INTERN"].map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button
              onClick={() => void createUser()}
              disabled={!snapshot || !isSignedIn || submitting || userName.trim().length < 2 || !userEmail.includes("@") || !selectedTeamId}
              className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Add User
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">Every employee must belong to a team. Manager is optional and can be shared by many employees.</p>
        </Card>

        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Employees</p>
              <h2 className="font-display text-2xl font-semibold">Team access</h2>
            </div>
            <input
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm sm:w-56"
              placeholder="Search employees"
            />
          </div>
          <div className="mt-5 max-h-[28rem] space-y-2 overflow-y-auto pr-2">
            {snapshot?.users.length ? (
              filteredUsers.map((user) => (
                <div key={user.id} className="rounded-[18px] bg-stone-100 px-4 py-3 text-sm">
                  <p className="font-medium">{user.name}</p>
                  <p className="text-slate-500">{user.email} - {user.role} - {user.hasPassword ? "employee login ready" : "password pending"}</p>
                  <p className="mt-1 text-xs text-slate-500">Manager: {user.managerName ?? "none"}</p>
                </div>
              ))
            ) : (
              <div className="rounded-[18px] border border-dashed border-black/10 bg-stone-50 px-4 py-4 text-sm text-slate-600">
                {signedOut ? "Sign in to manage users." : "No users added yet. Invite your first teammate here."}
              </div>
            )}
            {snapshot?.users.length && filteredUsers.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-black/10 bg-stone-50 px-4 py-4 text-sm text-slate-600">
                No employees match your search.
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-sm text-slate-500">Create team</p>
          {loadingWorkspace ? <LoadingShimmer /> : null}
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_140px_auto]">
            <input value={teamName} onChange={(event) => setTeamName(event.target.value)} className="flex-1 rounded-xl border border-black/10 px-3 py-2" />
            <input
              value={departmentCode}
              onChange={(event) => setDepartmentCode(event.target.value)}
              className="rounded-xl border border-black/10 px-3 py-2"
              placeholder="Dept code"
            />
            <button
              onClick={() => void createTeam()}
              disabled={!snapshot || !isSignedIn || submitting || teamName.trim().length < 2}
              className="rounded-full bg-teal-900 px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Add Team
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function isManagerRole(role: string) {
  return role === "MANAGER" || role === "ADMIN";
}

function LoadingShimmer() {
  return (
    <div className="mt-4 grid gap-2" aria-hidden="true">
      <div className="h-3 w-2/3 animate-pulse rounded-full bg-black/10" />
      <div className="h-3 w-1/2 animate-pulse rounded-full bg-black/10" />
    </div>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
