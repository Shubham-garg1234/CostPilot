import "dotenv/config";
import { createDb } from "../apps/api/src/db/client.js";
import { createId } from "../apps/api/src/db/id.js";
import { RoleKey, ViolationAction } from "../apps/api/src/db/types.js";

const db = createDb(process.env.DATABASE_URL!);

async function main() {
  await db.connect();

  const existing = await db.query<{ id: string }>(`SELECT "id" FROM "Organization" WHERE "slug" = $1`, ["acme-ai"]);
  let orgId = existing.rows[0]?.id;

  if (!orgId) {
    orgId = createId();
    const now = new Date();
    await db.query(
      `
        INSERT INTO "Organization" ("id", "name", "slug", "monthlyBudgetUsd", "markupPercentage", "createdAt", "updatedAt")
        VALUES ($1, 'Acme AI', 'acme-ai', 2500, 12.5, $2, $2)
      `,
      [orgId, now]
    );
  }

  const teams = await db.query<{ id: string; name: string }>(
    `SELECT "id", "name" FROM "Team" WHERE "organizationId" = $1`,
    [orgId]
  );

  const platformTeam =
    teams.rows.find((team) => team.name === "Platform") ??
    (
      await db.query<{ id: string }>(
        `INSERT INTO "Team" ("id", "name", "departmentCode", "organizationId") VALUES ($1, 'Platform', 'ENG-PLT', $2) RETURNING "id"`,
        [createId(), orgId]
      )
    ).rows[0];

  const supportTeam =
    teams.rows.find((team) => team.name === "Support Ops") ??
    (
      await db.query<{ id: string }>(
        `INSERT INTO "Team" ("id", "name", "departmentCode", "organizationId") VALUES ($1, 'Support Ops', 'OPS-SUP', $2) RETURNING "id"`,
        [createId(), orgId]
      )
    ).rows[0];

  if (!platformTeam?.id || !supportTeam?.id) {
    throw new Error("Seed teams were not created.");
  }

  const users = [
    {
      clerkUserId: "user_admin_seed",
      email: "admin@acme.ai",
      fullName: "Ava Admin",
      teamId: platformTeam.id,
      role: RoleKey.ADMIN
    },
    {
      clerkUserId: "user_manager_seed",
      email: "manager@acme.ai",
      fullName: "Marco Manager",
      teamId: supportTeam.id,
      role: RoleKey.MANAGER
    },
    {
      clerkUserId: "user_intern_seed",
      email: "intern@acme.ai",
      fullName: "Ivy Intern",
      teamId: supportTeam.id,
      role: RoleKey.INTERN
    }
  ];

  const now = new Date();
  for (const user of users) {
    await db.query(
      `
        INSERT INTO "User" (
          "id", "clerkUserId", "email", "fullName", "organizationId", "teamId", "role", "createdAt", "updatedAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
        ON CONFLICT ("email") DO NOTHING
      `,
      [createId(), user.clerkUserId, user.email, user.fullName, orgId, user.teamId, user.role, now]
    );
  }

  const policies = [
    {
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
      role: RoleKey.SDE1,
      category: "email_generation",
      feature: "auto_reply",
      maxTokensPerDay: 10000,
      maxRequestsPerHour: 30,
      maxCostPerMonthUsd: 50,
      allowedModels: ["gpt-4o-mini", "gpt-4.1-mini"],
      featureLocked: false,
      cooldownMinutes: 15,
      actionOnViolation: ViolationAction.WARN
    },
    {
      role: RoleKey.MANAGER,
      category: "chat",
      feature: null,
      maxTokensPerDay: 120000,
      maxRequestsPerHour: 250,
      maxCostPerMonthUsd: 400,
      allowedModels: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1"],
      featureLocked: false,
      cooldownMinutes: 5,
      actionOnViolation: ViolationAction.THROTTLE
    }
  ];

  for (const policy of policies) {
    await db.query(
      `
        INSERT INTO "Policy" (
          "id", "orgId", "role", "category", "feature",
          "maxTokensPerDay", "maxRequestsPerHour", "maxCostPerMonthUsd",
          "allowedModels", "featureLocked", "cooldownMinutes", "actionOnViolation",
          "createdAt", "updatedAt"
        )
        SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13
        WHERE NOT EXISTS (
          SELECT 1 FROM "Policy"
          WHERE "orgId" = $2 AND "role" = $3 AND "category" = $4 AND "feature" IS NOT DISTINCT FROM $5
        )
      `,
      [
        createId(),
        orgId,
        policy.role,
        policy.category,
        policy.feature,
        policy.maxTokensPerDay,
        policy.maxRequestsPerHour,
        policy.maxCostPerMonthUsd,
        policy.allowedModels,
        policy.featureLocked,
        policy.cooldownMinutes,
        policy.actionOnViolation,
        now
      ]
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.end();
  });
