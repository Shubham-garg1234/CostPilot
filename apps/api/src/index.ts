import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { buildApp } from "./app.js";
import { bootstrapApplicationSchema } from "./services/bootstrap-service.js";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(apiRoot, ".env") });

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

bootstrapApplicationSchema()
  .then(() => buildApp())
  .then((app) => app.listen({ port, host }))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
