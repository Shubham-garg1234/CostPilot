import "dotenv/config";
import { createDb } from "./client.js";
import { runMigrations } from "./migrate.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const db = createDb(databaseUrl);

db.connect()
  .then(() => runMigrations(db))
  .then(() => {
    console.log("Migrations applied.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.end());
