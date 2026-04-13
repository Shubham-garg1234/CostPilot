import Fastify from "fastify";
import { registerPlugins } from "./plugins.js";
import { registerLlmProxyRoutes } from "./routes/llm-proxy.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerPolicyRoutes } from "./routes/policies.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerOrganizationRoutes } from "./routes/organizations.js";
import { registerUsageEventRoutes } from "./routes/usage-events.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      transport: {
        target: "pino-pretty"
      }
    }
  });

  await registerPlugins(app);

  app.get("/health", async () => ({ status: "ok", service: "costpilot-api" }));

  await registerAuthRoutes(app);
  await registerOrganizationRoutes(app);
  await registerLlmProxyRoutes(app);
  await registerUsageEventRoutes(app);
  await registerDashboardRoutes(app);
  await registerPolicyRoutes(app);
  await registerBillingRoutes(app);

  return app;
}
