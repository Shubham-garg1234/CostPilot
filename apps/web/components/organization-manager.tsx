"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Card, Pill } from "./ui";
import { ApiError, requestJson } from "../lib/api";

type OrganizationSnapshot = {
  organization: {
    id: string;
    name: string;
    slug: string;
    governedCursorRequired: boolean;
    createdAt: string;
  };
  teams: Array<{ id: string; name: string; departmentCode?: string | null; userCount: number }>;
  users: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    teamId?: string | null;
    hasPassword: boolean;
    cursorComplianceStatus: string;
    cursorComplianceUpdatedAt?: string | null;
    lastGovernedCursorRequestAt?: string | null;
    managedCursorKey?: {
      id: string;
      name: string;
      clientType: string;
      status: string;
      secretPreview: string;
      expiresAt?: string | null;
      lastUsedAt?: string | null;
    } | null;
  }>;
  policies: Array<{ id: string }>;
};

type ManagedGatewayMutation = {
  secret?: string;
  key?: {
    id: string;
    status: string;
    secretPreview: string;
  };
};

function dateTime(value?: string | null) {
  if (!value) {
    return "Not seen yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function OrganizationManager() {
  const { isLoaded, isSignedIn } = useAuth();
  const [snapshot, setSnapshot] = useState<OrganizationSnapshot | null>(null);
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [teamName, setTeamName] = useState("AI Enablement");
  const [departmentCode, setDepartmentCode] = useState("AI");
  const [userName, setUserName] = useState("Rina Engineer");
  const [userEmail, setUserEmail] = useState("rina@northstar.ai");
  const [userRole, setUserRole] = useState("SDE1");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [status, setStatus] = useState("Checking your workspace...");
  const [submitting, setSubmitting] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<{ userId: string; secret: string } | null>(null);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      setSnapshot(null);
      setStatus("Sign in through organization login to create or manage your organization.");
      return;
    }

    void load();
  }, [isLoaded, isSignedIn]);

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

  async function load() {
    try {
      const payload = await requestJson<OrganizationSnapshot>("/api/organizations/current", { authMode: "clerk" });
      setSnapshot(payload);
      setOrgName((current) => current || payload.organization.name);
      setOrgSlug((current) => current || payload.organization.slug);
      setStatus(`Loaded ${payload.organization.name}`);
    } catch (error) {
      setSnapshot(null);
      setStatus(error instanceof ApiError ? error.message : "Unable to load organization.");
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
      await load();
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
      await load();
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
          role: userRole
        })
      });
      setStatus(
        payload.emailDelivered
          ? `Added ${userName}. Credentials were emailed automatically.`
          : `Added ${userName}. Temporary password: ${payload.temporaryPassword ?? "generated"}. ${payload.emailDeliveryNote ?? ""}`.trim()
      );
      await load();
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : "Unable to add user.");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateGovernedCursorRequired(governedCursorRequired: boolean) {
    try {
      setSubmitting(true);
      await requestJson("/api/managed-gateway/governance/cursor", {
        authMode: "clerk",
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ governedCursorRequired })
      });
      setStatus(governedCursorRequired ? "Managed Cursor governance is now required." : "Managed Cursor governance is now optional.");
      await load();
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : "Unable to update governed Cursor setting.");
    } finally {
      setSubmitting(false);
    }
  }

  async function issueManagedKey(userId: string) {
    try {
      setSubmitting(true);
      const payload = await requestJson<ManagedGatewayMutation>("/api/managed-gateway/keys", {
        authMode: "clerk",
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId,
          name: "Managed Cursor Key",
          clientType: "CURSOR"
        })
      });
      setRevealedSecret(payload.secret ? { userId, secret: payload.secret } : null);
      setStatus("Issued a managed Cursor gateway key.");
      await load();
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : "Unable to issue managed gateway key.");
    } finally {
      setSubmitting(false);
    }
  }

  async function rotateManagedKey(userId: string, keyId: string) {
    try {
      setSubmitting(true);
      const payload = await requestJson<ManagedGatewayMutation>(`/api/managed-gateway/keys/${keyId}/rotate`, {
        authMode: "clerk",
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });
      setRevealedSecret(payload.secret ? { userId, secret: payload.secret } : null);
      setStatus("Rotated the managed Cursor gateway key.");
      await load();
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : "Unable to rotate managed gateway key.");
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeManagedKey(keyId: string) {
    try {
      setSubmitting(true);
      await requestJson(`/api/managed-gateway/keys/${keyId}/revoke`, {
        authMode: "clerk",
        method: "POST"
      });
      setStatus("Revoked the managed Cursor gateway key.");
      await load();
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : "Unable to revoke managed gateway key.");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateCompliance(userId: string, complianceStatus: "COMPLIANT" | "NON_COMPLIANT") {
    try {
      setSubmitting(true);
      await requestJson(`/api/managed-gateway/users/${userId}/compliance`, {
        authMode: "clerk",
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ complianceStatus })
      });
      setStatus(`Marked employee as ${complianceStatus.toLowerCase().replace("_", " ")}.`);
      await load();
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : "Unable to update compliance state.");
    } finally {
      setSubmitting(false);
    }
  }

  const signedOut = isLoaded && !isSignedIn;
  const organizationLocked = snapshot
    ? snapshot.teams.length > 0 || snapshot.users.length > 1 || snapshot.policies.length > 0
    : false;
  const currentSlug = snapshot?.organization.slug ?? (signedOut ? "signed-out" : "no-organization");

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
            Use the dedicated <Link href="/organization/login" className="font-medium text-slate-900 underline">organization login</Link>
            {" "}route to enter the admin workspace.
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

        <Card className="mt-6 border border-black/5 bg-white/70 p-5 shadow-none">
          <p className="text-sm text-slate-500">Governed Cursor Access</p>
          <h2 className="mt-2 font-display text-2xl font-semibold">
            {snapshot?.organization.governedCursorRequired ? "Required" : "Optional"}
          </h2>
          <p className="mt-3 text-sm text-slate-600">
            Managed Cursor routes supported Azure/OpenAI-compatible chat traffic through CostPilot. Cursor features that depend on Cursor-managed specialized models can still bypass this path, so MCP stays available for observability and fallback imports.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={() => void updateGovernedCursorRequired(true)}
              disabled={!snapshot || submitting || snapshot.organization.governedCursorRequired}
              className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Require Governed Cursor
            </button>
            <button
              onClick={() => void updateGovernedCursorRequired(false)}
              disabled={!snapshot || submitting || !snapshot.organization.governedCursorRequired}
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:bg-stone-100"
            >
              Mark Optional
            </button>
          </div>
        </Card>

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

      <div className="space-y-6">
        <Card className="p-6">
          <p className="text-sm text-slate-500">Create team</p>
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

        <Card className="p-6">
          <p className="text-sm text-slate-500">Add employee</p>
          <div className="mt-4 grid gap-3">
            <input value={userName} onChange={(event) => setUserName(event.target.value)} className="rounded-xl border border-black/10 px-3 py-2" />
            <input value={userEmail} onChange={(event) => setUserEmail(event.target.value)} className="rounded-xl border border-black/10 px-3 py-2" />
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
          <p className="mt-3 text-xs text-slate-500">Every employee must belong to a team so reporting and policy ownership stay clean.</p>
        </Card>

        <Card className="p-6">
          <p className="text-sm text-slate-500">Managed Cursor Users</p>
          <div className="mt-5 space-y-3">
            {snapshot?.users.length ? (
              snapshot.users.map((user) => {
                const activeKey = user.managedCursorKey?.status === "ACTIVE" ? user.managedCursorKey : null;
                const userSecret = revealedSecret?.userId === user.id ? revealedSecret.secret : null;

                return (
                  <div key={user.id} className="rounded-[18px] bg-stone-100 px-4 py-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-slate-500">{user.email} / {user.role}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Pill>{user.cursorComplianceStatus}</Pill>
                        <Pill>{activeKey ? activeKey.status : "NO_ACTIVE_KEY"}</Pill>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 text-slate-600">
                      <p>Last governed request: {dateTime(user.lastGovernedCursorRequestAt)}</p>
                      <p>Key preview: {user.managedCursorKey?.secretPreview ? `...${user.managedCursorKey.secretPreview}` : "Not issued yet"}</p>
                      <p>Key last used: {dateTime(user.managedCursorKey?.lastUsedAt)}</p>
                    </div>

                    {userSecret ? (
                      <div className="mt-3 rounded-[16px] bg-stone-950 p-3 text-xs text-stone-100">
                        <p className="text-stone-400">Newest managed key</p>
                        <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all">{userSecret}</pre>
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => void issueManagedKey(user.id)}
                        disabled={submitting || Boolean(activeKey)}
                        className="rounded-full bg-black px-4 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        Issue Key
                      </button>
                      <button
                        onClick={() => activeKey && void rotateManagedKey(user.id, activeKey.id)}
                        disabled={submitting || !activeKey}
                        className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:bg-stone-100"
                      >
                        Rotate Key
                      </button>
                      <button
                        onClick={() => activeKey && void revokeManagedKey(activeKey.id)}
                        disabled={submitting || !activeKey}
                        className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-700 disabled:cursor-not-allowed disabled:bg-stone-100"
                      >
                        Revoke Key
                      </button>
                      <button
                        onClick={() => void updateCompliance(user.id, "COMPLIANT")}
                        disabled={submitting}
                        className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-700 disabled:cursor-not-allowed disabled:bg-stone-100"
                      >
                        Mark Compliant
                      </button>
                      <button
                        onClick={() => void updateCompliance(user.id, "NON_COMPLIANT")}
                        disabled={submitting}
                        className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-700 disabled:cursor-not-allowed disabled:bg-stone-100"
                      >
                        Mark Non-Compliant
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-[18px] border border-dashed border-black/10 bg-stone-50 px-4 py-4 text-sm text-slate-600">
                {signedOut ? "Sign in to manage users." : "No users added yet. Invite your first teammate here."}
              </div>
            )}
          </div>
        </Card>
      </div>
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
