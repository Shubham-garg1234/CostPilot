import "dotenv/config";
import { buildApp } from "./app.js";
import { bootstrapApplicationSchema } from "./services/bootstrap-service.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

bootstrapApplicationSchema()
  .then(() => buildApp())
  .then((app) => app.listen({ port, host }))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
