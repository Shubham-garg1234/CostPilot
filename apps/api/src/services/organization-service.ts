import { RoleKey, ViolationAction } from "@prisma/client";
import type { FastifyInstance } from "fastify";

export type OrganizationSnapshot = {
  organization: {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
  };
  teams: Array<{ id: string; name: string; departmentCode?: string | null; userCount: number }>;
  users: Array<{ id: string; email: string; name: string; role: RoleKey; teamId?: string | null }>;
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
      users: true,
      policies: true
    }
  });

  if (!organization) {
    throw new Error("Organization not found.");
  }

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
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
      teamId: user.teamId
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

export async function createOrganizationRecord(app: FastifyInstance, input: { name: string; slug: string }) {
  if (!app.prisma) {
    throw new Error("PostgreSQL is unavailable.");
  }

  const organization = await app.prisma.organization.create({
    data: {
      name: input.name,
      slug: input.slug
    }
  });

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    createdAt: organization.createdAt.toISOString()
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

  const user = await app.prisma.user.create({
    data: {
      organizationId: input.organizationId,
      email: input.email,
      fullName: input.fullName,
      role: input.role,
      teamId: input.teamId,
      clerkUserId: input.clerkUserId ?? input.email
    }
  });

  return {
    id: user.id,
    email: user.email,
    name: user.fullName,
    role: user.role,
    teamId: user.teamId
  };
}
