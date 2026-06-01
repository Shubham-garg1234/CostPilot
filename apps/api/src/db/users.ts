import type { Db } from "./client.js";
import { createId } from "./id.js";
import { mapUser } from "./mappers.js";
import type { RoleKey, UserRow } from "./types.js";

export async function countUsers(db: Db): Promise<number> {
  const result = await db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM "User"`);
  return Number(result.rows[0]?.count ?? 0);
}

export async function findUserById(db: Db, id: string): Promise<UserRow | null> {
  const result = await db.query(`SELECT * FROM "User" WHERE "id" = $1 LIMIT 1`, [id]);
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function findUserByEmail(db: Db, email: string): Promise<UserRow | null> {
  const result = await db.query(`SELECT * FROM "User" WHERE "email" = $1 LIMIT 1`, [email]);
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function findUserByEmailInsensitive(db: Db, email: string): Promise<UserRow | null> {
  const result = await db.query(
    `SELECT * FROM "User" WHERE LOWER("email") = LOWER($1) LIMIT 1`,
    [email.trim()]
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function listOrganizationHeads(db: Db, orgId: string): Promise<UserRow[]> {
  const result = await db.query(
    `
      SELECT * FROM "User"
      WHERE "organizationId" = $1 AND "role" IN ('ADMIN', 'MANAGER')
      ORDER BY
        CASE "role" WHEN 'ADMIN' THEN 0 WHEN 'MANAGER' THEN 1 ELSE 2 END,
        "createdAt" ASC
    `,
    [orgId]
  );

  return result.rows.map(mapUser);
}

export async function findUserForClerkIdentity(
  db: Db,
  input: { clerkUserId: string; primaryEmail?: string }
): Promise<UserRow | null> {
  const result = await db.query(
    `
      SELECT * FROM "User"
      WHERE "clerkUserId" = $1
         OR ($2::text IS NOT NULL AND "email" = $2)
      LIMIT 1
    `,
    [input.clerkUserId, input.primaryEmail ?? null]
  );

  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function createUser(
  db: Db,
  input: {
    organizationId: string;
    email: string;
    fullName: string;
    role: RoleKey;
    teamId?: string | null;
    managerId?: string | null;
    clerkUserId?: string | null;
    passwordHash?: string | null;
    passwordSetAt?: Date | null;
  }
): Promise<UserRow> {
  const id = createId();
  const now = new Date();
  const result = await db.query(
    `
      INSERT INTO "User" (
        "id", "clerkUserId", "email", "fullName", "organizationId", "teamId",
        "managerId", "role", "passwordHash", "passwordSetAt", "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
      RETURNING *
    `,
    [
      id,
      input.clerkUserId ?? null,
      input.email,
      input.fullName,
      input.organizationId,
      input.teamId ?? null,
      input.managerId ?? null,
      input.role,
      input.passwordHash ?? null,
      input.passwordSetAt ?? null,
      now
    ]
  );

  return mapUser(result.rows[0]);
}

export async function updateUserPassword(db: Db, userId: string, passwordHash: string, passwordSetAt: Date) {
  await db.query(
    `
      UPDATE "User"
      SET "passwordHash" = $2, "passwordSetAt" = $3, "updatedAt" = $3
      WHERE "id" = $1
    `,
    [userId, passwordHash, passwordSetAt]
  );
}

export async function findUserWithOrganization(db: Db, userId: string) {
  const result = await db.query(
    `
      SELECT
        u.*,
        o."name" AS "organizationName",
        o."slug" AS "organizationSlug"
      FROM "User" u
      INNER JOIN "Organization" o ON o."id" = u."organizationId"
      WHERE u."id" = $1
      LIMIT 1
    `,
    [userId]
  );

  if (!result.rows[0]) {
    return null;
  }

  const row = result.rows[0];
  return {
    user: mapUser(row),
    organization: {
      name: String(row.organizationName),
      slug: String(row.organizationSlug)
    }
  };
}
