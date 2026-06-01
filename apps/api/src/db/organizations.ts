import type { Db } from "./client.js";
import { createId } from "./id.js";
import { mapOrganization } from "./mappers.js";
import { RoleKey, type OrganizationRow } from "./types.js";

export async function findOrganizationById(db: Db, id: string): Promise<OrganizationRow | null> {
  const result = await db.query(`SELECT * FROM "Organization" WHERE "id" = $1 LIMIT 1`, [id]);
  return result.rows[0] ? mapOrganization(result.rows[0]) : null;
}

export async function findOrganizationBySlug(db: Db, slug: string): Promise<OrganizationRow | null> {
  const result = await db.query(`SELECT * FROM "Organization" WHERE "slug" = $1 LIMIT 1`, [slug]);
  return result.rows[0] ? mapOrganization(result.rows[0]) : null;
}

export async function countOrganizations(db: Db): Promise<number> {
  const result = await db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM "Organization"`);
  return Number(result.rows[0]?.count ?? 0);
}

export async function createOrganization(
  db: Db,
  input: { name: string; slug: string }
): Promise<OrganizationRow> {
  const id = createId();
  const now = new Date();
  const result = await db.query(
    `
      INSERT INTO "Organization" ("id", "name", "slug", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $4)
      RETURNING *
    `,
    [id, input.name, input.slug, now]
  );

  return mapOrganization(result.rows[0]);
}

export async function updateOrganization(
  db: Db,
  id: string,
  input: { name: string; slug: string }
): Promise<OrganizationRow> {
  const result = await db.query(
    `
      UPDATE "Organization"
      SET "name" = $2, "slug" = $3, "updatedAt" = $4
      WHERE "id" = $1
      RETURNING *
    `,
    [id, input.name, input.slug, new Date()]
  );

  return mapOrganization(result.rows[0]);
}

export type OrganizationEmptyCheck = {
  users: Array<{ id: string }>;
  counts: {
    teams: number;
    policies: number;
    usageEvents: number;
    billingRecords: number;
    violations: number;
  };
};

export async function getOrganizationEmptyCheck(db: Db, orgId: string): Promise<OrganizationEmptyCheck | null> {
  const org = await findOrganizationById(db, orgId);
  if (!org) {
    return null;
  }

  const [users, counts] = await Promise.all([
    db.query<{ id: string }>(`SELECT "id" FROM "User" WHERE "organizationId" = $1`, [orgId]),
    db.query<{
      teams: string;
      policies: string;
      usageEvents: string;
      billingRecords: string;
      violations: string;
    }>(
      `
        SELECT
          (SELECT COUNT(*)::text FROM "Team" WHERE "organizationId" = $1) AS teams,
          (SELECT COUNT(*)::text FROM "Policy" WHERE "orgId" = $1) AS policies,
          (SELECT COUNT(*)::text FROM "UsageEvent" WHERE "orgId" = $1) AS "usageEvents",
          (SELECT COUNT(*)::text FROM "BillingRecord" WHERE "orgId" = $1) AS "billingRecords",
          (SELECT COUNT(*)::text FROM "Violation" WHERE "orgId" = $1) AS violations
      `,
      [orgId]
    )
  ]);

  const row = counts.rows[0];
  return {
    users: users.rows,
    counts: {
      teams: Number(row?.teams ?? 0),
      policies: Number(row?.policies ?? 0),
      usageEvents: Number(row?.usageEvents ?? 0),
      billingRecords: Number(row?.billingRecords ?? 0),
      violations: Number(row?.violations ?? 0)
    }
  };
}

export async function createOrganizationWithAdminUser(
  db: Db,
  input: { name: string; slug: string; clerkUserId: string; email: string; fullName: string }
) {
  return db.transaction(async (client) => {
    const orgId = createId();
    const userId = createId();
    const now = new Date();
    await client.query(
      `INSERT INTO "Organization" ("id", "name", "slug", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$4)`,
      [orgId, input.name, input.slug, now]
    );
    await client.query(
      `
        INSERT INTO "User" (
          "id", "clerkUserId", "email", "fullName", "organizationId", "managerId", "role", "createdAt", "updatedAt"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
      `,
      [userId, input.clerkUserId, input.email, input.fullName, orgId, null, RoleKey.ADMIN, now]
    );
    const org = await client.query(`SELECT * FROM "Organization" WHERE "id" = $1`, [orgId]);
    return mapOrganization(org.rows[0]!);
  });
}

export async function getOrganizationSnapshotRows(db: Db, orgId: string) {
  const [organization, teams, users, policies] = await Promise.all([
    findOrganizationById(db, orgId),
    db.query(
      `
        SELECT t.*, COUNT(u."id")::int AS "userCount"
        FROM "Team" t
        LEFT JOIN "User" u ON u."teamId" = t."id"
        WHERE t."organizationId" = $1
        GROUP BY t."id"
        ORDER BY t."name" ASC
      `,
      [orgId]
    ),
    db.query(
      `
        SELECT u.*, m."fullName" AS "managerName"
        FROM "User" u
        LEFT JOIN "User" m ON m."id" = u."managerId"
        WHERE u."organizationId" = $1
        ORDER BY u."fullName" ASC
      `,
      [orgId]
    ),
    db.query(`SELECT * FROM "Policy" WHERE "orgId" = $1 ORDER BY "role" ASC, "category" ASC`, [orgId])
  ]);

  return { organization, teams: teams.rows, users: users.rows, policies: policies.rows };
}
