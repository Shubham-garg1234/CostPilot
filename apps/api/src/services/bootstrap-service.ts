import { createDb } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";

export async function bootstrapApplicationSchema() {
  const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL or DIRECT_URL is required to run database migrations.");
  }

  const db = createDb(databaseUrl);
  try {
    await db.connect();
    await runMigrations(db);
  } finally {
    await db.end();
  }
}
