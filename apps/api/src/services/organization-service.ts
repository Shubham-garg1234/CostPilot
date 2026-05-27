import { RoleKey, type ViolationAction } from "../db/types.js";
import {
  createOrganization,
  createOrganizationWithAdminUser as createOrganizationWithAdminUserRow,
  findOrganizationById,
  getOrganizationEmptyCheck,
  getOrganizationSnapshotRows,
  updateOrganization
} from "../db/organizations.js";
import { createTeam } from "../db/teams.js";
import { createUser } from "../db/users.js";
import { mapPolicy, mapUser } from "../db/mappers.js";
import type { FastifyInstance } from "fastify";
import { createPasswordHash, generateTemporaryPassword } from "./employee-auth-service.js";
import { sendEmployeeCredentialsEmail } from "./mailer-service.js";

export class OrganizationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationConflictError";
  }
}

export class OrganizationNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationNotFoundError";
  }
}

export type OrganizationSnapshot = {
  organization: {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
  };
  teams: Array<{ id: string; name: string; departmentCode?: string | null; userCount: number }>;
  users: Array<{ id: string; email: string; name: string; role: RoleKey; teamId?: string | null; hasPassword: boolean }>;
  policies: Array<{
    id: string;
    role: RoleKey;
    category: string;
    feature?: string | null;
    actionOnViolation: ViolationAction;
    allowedModels: string[];
    maxTokensPerDay?: number | null;
    maxRequestsPerHour?: number | null;
  }>;
};

export async function getOrganizationSnapshot(app: FastifyInstance, orgId: string): Promise<OrganizationSnapshot> {
  if (!app.db) {
    throw new Error("PostgreSQL is unavailable.");
  }

  const snapshot = await getOrganizationSnapshotRows(app.db, orgId);

  if (!snapshot.organization) {
    throw new OrganizationNotFoundError("Organization not found.");
  }

  return {
    organization: {
      id: snapshot.organization.id,
      name: snapshot.organization.name,
      slug: snapshot.organization.slug,
      createdAt: snapshot.organization.createdAt.toISOString()
    },
    teams: snapshot.teams.map((team) => ({
      id: String(team.id),
      name: String(team.name),
      departmentCode: team.departmentCode ? String(team.departmentCode) : null,
      userCount: Number(team.userCount ?? 0)
    })),
    users: snapshot.users.map((user) => {
      const mapped = mapUser(user);
      return {
        id: mapped.id,
        email: mapped.email,
        name: mapped.fullName,
        role: mapped.role,
        teamId: mapped.teamId,
        hasPassword: Boolean(mapped.passwordHash)
      };
    }),
    policies: snapshot.policies.map((policy) => {
      const mapped = mapPolicy(policy);
      return {
        id: mapped.id,
        role: mapped.role,
        category: mapped.category,
        feature: mapped.feature,
        actionOnViolation: mapped.actionOnViolation,
        allowedModels: mapped.allowedModels,
        maxTokensPerDay: mapped.maxTokensPerDay,
        maxRequestsPerHour: mapped.maxRequestsPerHour
      };
    })
  };
}

export async function createOrganizationRecord(
  app: FastifyInstance,
  input: { name: string; slug: string; currentOrgId: string; actorUserId: string }
) {
  if (!app.db) {
    throw new Error("PostgreSQL is unavailable.");
  }

  const currentOrganization = await getOrganizationEmptyCheck(app.db, input.currentOrgId);
  let organization;

  if (!currentOrganization) {
    organization = await createOrganization(app.db, { name: input.name, slug: input.slug });

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt.toISOString(),
      created: true
    };
  }

  const onlyActorBelongsToCurrentOrganization =
    currentOrganization.users.length === 1 && currentOrganization.users[0]?.id === input.actorUserId;
  const currentOrganizationIsEmpty =
    currentOrganization.counts.teams === 0 &&
    currentOrganization.counts.policies === 0 &&
    currentOrganization.counts.usageEvents === 0 &&
    currentOrganization.counts.billingRecords === 0 &&
    currentOrganization.counts.violations === 0;

  if (!onlyActorBelongsToCurrentOrganization || !currentOrganizationIsEmpty) {
    throw new OrganizationConflictError(
      "Your account already belongs to an active organization. Use the current workspace instead of creating another one."
    );
  }

  organization = await updateOrganization(app.db, input.currentOrgId, { name: input.name, slug: input.slug });

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    createdAt: organization.createdAt.toISOString(),
    created: false
  };
}

export async function createOrganizationWithAdminUserRecord(
  app: FastifyInstance,
  input: { name: string; slug: string; clerkUserId: string; email: string; fullName: string }
) {
  if (!app.db) {
    throw new Error("PostgreSQL is unavailable.");
  }

  const organization = await createOrganizationWithAdminUserRow(app.db, input);

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    createdAt: organization.createdAt.toISOString(),
    created: true
  };
}

export async function createTeamRecord(
  app: FastifyInstance,
  input: { organizationId: string; name: string; departmentCode?: string }
) {
  if (!app.db) {
    throw new Error("PostgreSQL is unavailable.");
  }

  const team = await createTeam(app.db, input);

  return {
    id: team.id,
    organizationId: team.organizationId,
    name: team.name,
    departmentCode: team.departmentCode,
    userCount: 0
  };
}

export async function createUserRecord(
  app: FastifyInstance,
  input: {
    organizationId: string;
    email: string;
    fullName: string;
    role: RoleKey;
    teamId?: string | null;
    clerkUserId?: string;
  }
) {
  if (!app.db) {
    throw new Error("PostgreSQL is unavailable.");
  }

  if (input.teamId) {
    const { findTeamInOrganization } = await import("../db/teams.js");
    const team = await findTeamInOrganization(app.db, input.teamId, input.organizationId);

    if (!team) {
      throw new Error("Selected team does not belong to the current organization.");
    }
  }

  const organization = await findOrganizationById(app.db, input.organizationId);

  if (!organization) {
    throw new Error("Organization not found.");
  }

  const temporaryPassword = generateTemporaryPassword();

  const user = await createUser(app.db, {
    organizationId: input.organizationId,
    email: input.email,
    fullName: input.fullName,
    role: input.role,
    teamId: input.teamId,
    clerkUserId: input.clerkUserId ?? null,
    passwordHash: createPasswordHash(temporaryPassword),
    passwordSetAt: new Date()
  });

  const emailResult = await sendEmployeeCredentialsEmail({
    to: user.email,
    fullName: user.fullName,
    organizationId: organization.id,
    organizationName: organization.name,
    password: temporaryPassword
  });

  return {
    id: user.id,
    email: user.email,
    name: user.fullName,
    role: user.role,
    teamId: user.teamId,
    temporaryPassword,
    emailDelivered: emailResult.delivered,
    emailDeliveryNote: emailResult.delivered ? undefined : emailResult.reason
  };
}
