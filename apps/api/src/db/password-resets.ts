import type { Db } from "./client.js";
import { createId } from "./id.js";

export async function replacePendingPasswordReset(db: Db, userId: string, tokenHash: string, expiresAt: Date) {
  await db.transaction(async (client) => {
    await client.query(`DELETE FROM "EmployeePasswordReset" WHERE "userId" = $1 AND "usedAt" IS NULL`, [userId]);
    await client.query(
      `INSERT INTO "EmployeePasswordReset" ("id", "userId", "tokenHash", "expiresAt", "createdAt") VALUES ($1,$2,$3,$4,$5)`,
      [createId(), userId, tokenHash, expiresAt, new Date()]
    );
  });
}

export async function deletePasswordResetByTokenHash(db: Db, tokenHash: string) {
  await db.query(`DELETE FROM "EmployeePasswordReset" WHERE "tokenHash" = $1`, [tokenHash]);
}

export async function findValidPasswordReset(db: Db, tokenHash: string) {
  const result = await db.query<{ id: string; userId: string }>(
    `
      SELECT id, "userId" FROM "EmployeePasswordReset"
      WHERE "tokenHash" = $1 AND "usedAt" IS NULL AND "expiresAt" > NOW()
      LIMIT 1
    `,
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

export async function completePasswordReset(db: Db, userId: string, passwordHash: string, passwordSetAt: Date) {
  await db.transaction(async (client) => {
    await client.query(
      `UPDATE "User" SET "passwordHash" = $2, "passwordSetAt" = $3, "updatedAt" = $3 WHERE id = $1`,
      [userId, passwordHash, passwordSetAt]
    );
    await client.query(`UPDATE "EmployeePasswordReset" SET "usedAt" = $2 WHERE "userId" = $1 AND "usedAt" IS NULL`, [
      userId,
      passwordSetAt
    ]);
  });
}
