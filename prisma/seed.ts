import { PrismaClient, RoleKey, ViolationAction } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "acme-ai" },
    update: {},
    create: {
      name: "Acme AI",
      slug: "acme-ai",
      monthlyBudgetUsd: 2500,
      markupPercentage: 12.5,
      teams: {
        create: [
          { name: "Platform", departmentCode: "ENG-PLT" },
          { name: "Support Ops", departmentCode: "OPS-SUP" },
          { name: "Growth", departmentCode: "GTM-GRW" }
        ]
      }
    },
    include: { teams: true }
  });

  const platformTeam = org.teams.find((team) => team.name === "Platform");
  const supportTeam = org.teams.find((team) => team.name === "Support Ops");

  if (!platformTeam || !supportTeam) {
    throw new Error("Seed teams were not created.");
  }

  await prisma.user.createMany({
    data: [
      {
        clerkUserId: "user_admin_seed",
        email: "admin@acme.ai",
        fullName: "Ava Admin",
        organizationId: org.id,
        teamId: platformTeam.id,
        role: RoleKey.ADMIN
      },
      {
        clerkUserId: "user_manager_seed",
        email: "manager@acme.ai",
        fullName: "Marco Manager",
        organizationId: org.id,
        teamId: supportTeam.id,
        role: RoleKey.MANAGER
      },
      {
        clerkUserId: "user_intern_seed",
        email: "intern@acme.ai",
        fullName: "Ivy Intern",
        organizationId: org.id,
        teamId: supportTeam.id,
        role: RoleKey.INTERN
      }
    ],
    skipDuplicates: true
  });

  await prisma.policy.createMany({
    data: [
      {
        orgId: org.id,
        role: RoleKey.INTERN,
        category: "code_generation",
        feature: "copilot",
        maxTokensPerDay: 0,
        maxRequestsPerHour: 0,
        maxCostPerMonthUsd: 0,
        allowedModels: ["gpt-4o-mini"],
        featureLocked: true,
        cooldownMinutes: 60,
        actionOnViolation: ViolationAction.BLOCK
      },
      {
        orgId: org.id,
        role: RoleKey.SDE1,
        category: "email_generation",
        feature: "auto_reply",
        maxTokensPerDay: 10000,
        maxRequestsPerHour: 30,
        maxCostPerMonthUsd: 50,
        allowedModels: ["gpt-4o-mini", "gpt-4.1-mini"],
        cooldownMinutes: 15,
        actionOnViolation: ViolationAction.WARN
      },
      {
        orgId: org.id,
        role: RoleKey.MANAGER,
        category: "chat",
        maxTokensPerDay: 120000,
        maxRequestsPerHour: 250,
        maxCostPerMonthUsd: 400,
        allowedModels: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1"],
        cooldownMinutes: 5,
        actionOnViolation: ViolationAction.THROTTLE
      }
    ],
    skipDuplicates: true
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
