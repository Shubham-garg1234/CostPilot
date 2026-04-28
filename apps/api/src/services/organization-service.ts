import { ManagedClientType, RoleKey, ViolationAction } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { createPasswordHash, generateTemporaryPassword } from "./employee-auth-service.js";
import { serializeManagedGatewayKey } from "./managed-gateway-service.js";
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
    governedCursorRequired: boolean;
    createdAt: string;
  };
  teams: Array<{ id: string; name: string; departmentCode?: string | null; userCount: number }>;
  users: Array<{
    id: string;
    email: string;
    name: string;
    role: RoleKey;
    teamId?: string | null;
    hasPassword: boolean;
    cursorComplianceStatus: string;
    cursorComplianceUpdatedAt?: string | null;
    lastGovernedCursorRequestAt?: string | null;
    managedCursorKey?: ReturnType<typeof serializeManagedGatewayKey> | null;
  }>;
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
  if (!app.prisma) {
    throw new Error("PostgreSQL is unavailable.");
  }

  const organization = await app.prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      teams: {
        include: {
          _count: {
            select: { users: true }
          }
        }
      },
      users: {
        include: {
          managedGatewayKeys: {
            where: {
              clientType: ManagedClientType.CURSOR
            },
            orderBy: {
              createdAt: "desc"
            }
          }
        }
      },
      policies: true
    }
  });

  if (!organization) {
    throw new OrganizationNotFoundError("Organization not found.");
  }

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      governedCursorRequired: organization.governedCursorRequired,
      createdAt: organization.createdAt.toISOString()
    },
    teams: organization.teams.map((team) => ({
      id: team.id,
      name: team.name,
      departmentCode: team.departmentCode,
      userCount: team._count.users
    })),
    users: organization.users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.fullName,
      role: user.role,
      teamId: user.teamId,
      hasPassword: Boolean(user.passwordHash),
      cursorComplianceStatus: user.cursorComplianceStatus,
      cursorComplianceUpdatedAt: user.cursorComplianceUpdatedAt?.toISOString() ?? null,
      lastGovernedCursorRequestAt: user.lastGovernedCursorRequestAt?.toISOString() ?? null,
      managedCursorKey: user.managedGatewayKeys[0] ? serializeManagedGatewayKey(user.managedGatewayKeys[0]) : null
    })),
    policies: organization.policies.map((policy) => ({
      id: policy.id,
      role: policy.role,
      category: policy.category,
      feature: policy.feature,
      actionOnViolation: policy.actionOnViolation,
      allowedModels: policy.allowedModels,
      maxTokensPerDay: policy.maxTokensPerDay,
      maxRequestsPerHour: policy.maxRequestsPerHour
    }))
  };
}

export async function createOrganizationRecord(
  app: FastifyInstance,
  input: { name: string; slug: string; currentOrgId: string; actorUserId: string }
) {
  if (!app.prisma) {
    throw new Error("PostgreSQL is unavailable.");
  }

  const currentOrganization = await app.prisma.organization.findUnique({
    where: { id: input.currentOrgId },
    include: {
      users: {
        select: {
          id: true
        }
      },
      _count: {
        select: {
          teams: true,
          policies: true,
          usageEvents: true,
          billingRecords: true,
          violations: true
        }
      }
    }
  });

  let organization;

  if (!currentOrganization) {
    organization = await app.prisma.organization.create({
      data: {
        name: input.name,
        slug: input.slug
      }
    });

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
    currentOrganization._count.teams === 0 &&
    currentOrganization._count.policies === 0 &&
    currentOrganization._count.usageEvents === 0 &&
    currentOrganization._count.billingRecords === 0 &&
    currentOrganization._count.violations === 0;

  if (!onlyActorBelongsToCurrentOrganization || !currentOrganizationIsEmpty) {
    throw new OrganizationConflictError(
      "Your account already belongs to an active organization. Use the current workspace instead of creating another one."
    );
  }

  organization = await app.prisma.organization.update({
    where: { id: currentOrganization.id },
    data: {
      name: input.name,
      slug: input.slug
    }
  });

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    createdAt: organization.createdAt.toISOString(),
    created: false
  };
}

export async function createTeamRecord(
  app: FastifyInstance,
  input: { organizationId: string; name: string; departmentCode?: string }
) {
  if (!app.prisma) {
    throw new Error("PostgreSQL is unavailable.");
  }

  const team = await app.prisma.team.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      departmentCode: input.departmentCode
    }
  });

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
  if (!app.prisma) {
    throw new Error("PostgreSQL is unavailable.");
  }

  if (input.teamId) {
    const team = await app.prisma.team.findFirst({
      where: {
        id: input.teamId,
        organizationId: input.organizationId
      },
      select: {
        id: true
      }
    });

    if (!team) {
      throw new Error("Selected team does not belong to the current organization.");
    }
  }

  const organization = await app.prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { id: true, name: true }
  });

  if (!organization) {
    throw new Error("Organization not found.");
  }

  const temporaryPassword = generateTemporaryPassword();

  const user = await app.prisma.user.create({
    data: {
      organizationId: input.organizationId,
      email: input.email,
      fullName: input.fullName,
      role: input.role,
      teamId: input.teamId,
      clerkUserId: input.clerkUserId ?? null,
      passwordHash: createPasswordHash(temporaryPassword),
      passwordSetAt: new Date()
    }
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
