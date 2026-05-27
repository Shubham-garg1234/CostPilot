import type { Db } from "./client.js";
import { createId } from "./id.js";
import { mapBillingRecord } from "./mappers.js";

export async function listBillingRecords(db: Db, orgId: string, limit: number) {
  const result = await db.query(
    `SELECT * FROM "BillingRecord" WHERE "orgId" = $1 ORDER BY "periodStart" DESC LIMIT $2`,
    [orgId, limit]
  );
  return result.rows.map(mapBillingRecord);
}

export async function createBillingRecord(
  db: Db,
  input: {
    orgId: string;
    periodStart: Date;
    periodEnd: Date;
    rawCostUsd: number;
    markupPercentage: number;
    finalCostUsd: number;
  }
) {
  const id = createId();
  const now = new Date();
  const result = await db.query(
    `
      INSERT INTO "BillingRecord" (
        "id", "orgId", "periodStart", "periodEnd", "rawCostUsd", "markupPercentage",
        "finalCostUsd", status, "createdAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8)
      RETURNING *
    `,
    [id, input.orgId, input.periodStart, input.periodEnd, input.rawCostUsd, input.markupPercentage, input.finalCostUsd, now]
  );
  return mapBillingRecord(result.rows[0]!);
}

export async function getOrganizationMarkupPercentage(db: Db, orgId: string) {
  const result = await db.query<{ markupPercentage: string }>(
    `SELECT "markupPercentage"::text FROM "Organization" WHERE id = $1`,
    [orgId]
  );
  return Number(result.rows[0]?.markupPercentage ?? 0);
}
