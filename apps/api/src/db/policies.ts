import type { Db } from "./client.js";
import { createId } from "./id.js";
import { mapPolicy } from "./mappers.js";
import type { CreatePolicyInput, PolicyRow, RoleKey } from "./types.js";

export async function listPolicies(
  db: Db,
  input: { orgId: string; role?: RoleKey }
): Promise<PolicyRow[]> {
  const result = input.role
    ? await db.query(
        `SELECT * FROM "Policy" WHERE "orgId" = $1 AND "role" = $2 ORDER BY "role" ASC, "category" ASC`,
        [input.orgId, input.role]
      )
    : await db.query(`SELECT * FROM "Policy" WHERE "orgId" = $1 ORDER BY "role" ASC, "category" ASC`, [input.orgId]);

  return result.rows.map(mapPolicy);
}

export async function findActivePoliciesForEvaluation(
  db: Db,
  input: { orgId: string; role: RoleKey; category: string }
): Promise<PolicyRow[]> {
  const result = await db.query(
    `
      SELECT * FROM "Policy"
      WHERE "orgId" = $1 AND "role" = $2 AND "category" = $3 AND "disabled" = false
      ORDER BY "createdAt" DESC
    `,
    [input.orgId, input.role, input.category]
  );

  return result.rows.map(mapPolicy);
}

export async function createPolicy(db: Db, input: CreatePolicyInput): Promise<PolicyRow> {
  const id = createId();
  const now = new Date();
  const result = await db.query(
    `
      INSERT INTO "Policy" (
        "id", "orgId", "role", "category", "feature",
        "maxTokensPerDay", "maxRequestsPerHour", "maxCostPerMonthUsd",
        "allowedModels", "actionOnViolation", "cooldownMinutes", "featureLocked",
        "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
      RETURNING *
    `,
    [
      id,
      input.orgId,
      input.role,
      input.category,
      input.feature,
      input.maxTokensPerDay,
      input.maxRequestsPerHour,
      input.maxCostPerMonthUsd,
      input.allowedModels,
      input.actionOnViolation,
      input.cooldownMinutes,
      input.featureLocked,
      now
    ]
  );

  return mapPolicy(result.rows[0]);
}
