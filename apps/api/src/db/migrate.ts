import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./client.js";

const MIGRATIONS_TABLE = "schema_migrations";

export function getMigrationsDirectory() {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), "../../../../db/migrations");
}

export async function runMigrations(db: Db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
      "name" TEXT PRIMARY KEY,
      "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await importLegacyPrismaMigrations(db);

  const migrationsDir = getMigrationsDirectory();
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const migrationFiles: string[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      const nested = path.join(migrationsDir, entry.name, "migration.sql");
      migrationFiles.push(nested);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".sql")) {
      migrationFiles.push(path.join(migrationsDir, entry.name));
    }
  }

  for (const filePath of migrationFiles.sort()) {
    const name = path.basename(path.dirname(filePath)) === "migrations"
      ? path.basename(filePath, ".sql")
      : path.basename(path.dirname(filePath));

    const applied = await db.query<{ name: string }>(
      `SELECT "name" FROM "${MIGRATIONS_TABLE}" WHERE "name" = $1`,
      [name]
    );

    if (applied.rowCount && applied.rowCount > 0) {
      continue;
    }

    const sql = await readFile(filePath, "utf8");
    await db.transaction(async (client) => {
      await client.query(sql);
      await client.query(`INSERT INTO "${MIGRATIONS_TABLE}" ("name") VALUES ($1)`, [name]);
    });
  }
}

async function importLegacyPrismaMigrations(db: Db) {
  const legacy = await db.query<{ exists: boolean }>(`
    SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS exists
  `);

  if (!legacy.rows[0]?.exists) {
    return;
  }

  const prismaMigrations = await db.query<{ migration_name: string }>(`
    SELECT "migration_name" AS migration_name
    FROM "_prisma_migrations"
    WHERE "finished_at" IS NOT NULL
    ORDER BY "finished_at" ASC
  `);

  for (const row of prismaMigrations.rows) {
    await db.query(
      `INSERT INTO "${MIGRATIONS_TABLE}" ("name") VALUES ($1) ON CONFLICT ("name") DO NOTHING`,
      [row.migration_name]
    );
  }
}
