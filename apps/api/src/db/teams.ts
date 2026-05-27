import type { Db } from "./client.js";
import { createId } from "./id.js";
import { mapTeam } from "./mappers.js";
import type { TeamRow } from "./types.js";

export async function findTeamInOrganization(db: Db, teamId: string, organizationId: string): Promise<TeamRow | null> {
  const result = await db.query(
    `SELECT * FROM "Team" WHERE "id" = $1 AND "organizationId" = $2 LIMIT 1`,
    [teamId, organizationId]
  );
  return result.rows[0] ? mapTeam(result.rows[0]) : null;
}

export async function createTeam(
  db: Db,
  input: { organizationId: string; name: string; departmentCode?: string }
): Promise<TeamRow> {
  const id = createId();
  const result = await db.query(
    `
      INSERT INTO "Team" ("id", "name", "departmentCode", "organizationId")
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
    [id, input.name, input.departmentCode ?? null, input.organizationId]
  );

  return mapTeam(result.rows[0]);
}
