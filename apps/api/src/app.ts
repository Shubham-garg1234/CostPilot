import Fastify from "fastify";
import { registerPlugins } from "./plugins.js";
import { registerLlmProxyRoutes } from "./routes/llm-proxy.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerPolicyRoutes } from "./routes/policies.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerOrganizationRoutes } from "./routes/organizations.js";
import { registerUsageEventRoutes } from "./routes/usage-events.js";
import { getEnvConfig } from "./config.js";

export async function buildApp() {
  const env = getEnvConfig();
  const app = Fastify({
    logger:
      env.NODE_ENV === "production"
        ? true
        : {
            transport: {
              target: "pino-pretty"
            }
          }
  });

  await registerPlugins(app);

  app.get("/health", async () => ({
    status: "ok",
    service: "costpilot-api",
    environment: env.NODE_ENV,
    authMode: env.AUTH_MODE,
    dependencies: {
      postgres: Boolean(app.prisma),
      redis: "connect" in app.redis,
      clickhouse: Boolean(app.clickhouse)
    }
  }));

  await registerAuthRoutes(app);
  await registerOrganizationRoutes(app);
  await registerLlmProxyRoutes(app);
  await registerUsageEventRoutes(app);
  await registerDashboardRoutes(app);
  await registerPolicyRoutes(app);
  await registerBillingRoutes(app);

  return app;
}
