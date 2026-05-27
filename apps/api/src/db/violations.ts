import type { Db } from "./client.js";
import { createId } from "./id.js";
import { mapViolation } from "./mappers.js";
import type { RoleKey, ViolationAction, ViolationType } from "./types.js";

export async function createViolation(
  db: Db,
  input: {
    orgId: string;
    userId: string;
    role: RoleKey;
    category: string;
    feature?: string;
    model: string;
    type: ViolationType;
    actionTaken: ViolationAction;
    message: string;
    metadata?: Record<string, unknown>;
  }
) {
  const id = createId();
  await db.query(
    `
      INSERT INTO "Violation" (
        "id", "orgId", "userId", role, category, feature, model, type, "actionTaken", message, metadata, "createdAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `,
    [
      id,
      input.orgId,
      input.userId,
      input.role,
      input.category,
      input.feature ?? null,
      input.model,
      input.type,
      input.actionTaken,
      input.message,
      input.metadata ? JSON.stringify(input.metadata) : null,
      new Date()
    ]
  );
}

export async function listRecentViolations(db: Db, orgId: string, limit: number) {
  const result = await db.query(
    `SELECT * FROM "Violation" WHERE "orgId" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
    [orgId, limit]
  );
  return result.rows.map(mapViolation);
}
