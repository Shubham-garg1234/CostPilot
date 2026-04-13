import { Prisma, RoleKey, ViolationAction, type Organization, type Policy, type Team, type User } from "@prisma/client";
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

const demoOrganization = {
  organization: {
    id: "acme-org",
    name: "Acme AI",
    slug: "acme-ai",
    createdAt: new Date("2026-04-01T00:00:00.000Z").toISOString()
  },
  teams: [
    { id: "platform-team", name: "Platform", departmentCode: "ENG-PLT", userCount: 1 },
    { id: "support-team", name: "Support Ops", departmentCode: "OPS-SUP", userCount: 2 },
    { id: "growth-team", name: "Growth", departmentCode: "GTM-GRW", userCount: 0 }
  ],
  users: [
    { id: "user_admin_seed", email: "admin@acme.ai", name: "Ava Admin", role: RoleKey.ADMIN, teamId: "platform-team" },
    { id: "user_manager_seed", email: "manager@acme.ai", name: "Marco Manager", role: RoleKey.MANAGER, teamId: "support-team" },
    { id: "user_intern_seed", email: "intern@acme.ai", name: "Ivy Intern", role: RoleKey.INTERN, teamId: "support-team" }
  ],
  policies: [
    {
      id: "policy-intern-code",
      role: RoleKey.INTERN,
      category: "code_generation",
      feature: "copilot",
      actionOnViolation: ViolationAction.BLOCK,
      allowedModels: ["gpt-4o-mini"],
      maxTokensPerDay: 0,
      maxRequestsPerHour: 0
    },
    {
      id: "policy-sde1-email",
      role: RoleKey.SDE1,
      category: "email_generation",
      feature: "auto_reply",
      actionOnViolation: ViolationAction.WARN,
      allowedModels: ["gpt-4o-mini", "gpt-4.1-mini"],
      maxTokensPerDay: 10000,
      maxRequestsPerHour: 5
    }
  ]
} satisfies OrganizationSnapshot;

export async function getOrganizationSnapshot(app: FastifyInstance, orgId: string): Promise<OrganizationSnapshot> {
  if (!app.prisma) {
    return demoOrganization;
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
    return demoOrganization;
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
    return {
      id: `demo-org-${input.slug}`,
      name: input.name,
      slug: input.slug,
      createdAt: new Date().toISOString()
    };
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
    return {
      id: `demo-team-${input.name.toLowerCase().replace(/\s+/g, "-")}`,
      ...input,
      userCount: 0
    };
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
    return {
      id: `demo-user-${input.email}`,
      email: input.email,
      name: input.fullName,
      role: input.role,
      teamId: input.teamId ?? null
    };
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
