import Fastify from "fastify";
import { registerPlugins } from "./plugins.js";
import { registerLlmProxyRoutes } from "./routes/llm-proxy.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerPolicyRoutes } from "./routes/policies.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerOrganizationRoutes } from "./routes/organizations.js";
import { registerUsageEventRoutes } from "./routes/usage-events.js";
import { registerManagedGatewayRoutes } from "./routes/managed-gateway.js";
import { registerCursorGatewayRoutes } from "./routes/cursor-gateway.js";
import { getEnvConfig } from "./config.js";
import { readMcpHeartbeat } from "./services/mcp-status-service.js";

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
    authMode: env.AUTH_MODE
  }));

  app.get("/ready", async (_, reply) => {
    const ready = app.isReadyForTraffic();
    const mcp = readMcpHeartbeat();
    const payload = {
      status: ready ? "ready" : "degraded",
      service: "costpilot-api",
      environment: env.NODE_ENV,
      authMode: env.AUTH_MODE,
      dependencies: app.dependencyStates,
      mcp: {
        ...mcp,
        auth: "employee-credentials",
        entrypoint: "apps/api/src/mcp/index.ts"
      }
    };

    if (!ready) {
      return reply.status(503).send(payload);
    }

    return payload;
  });

  await registerAuthRoutes(app);
  await registerOrganizationRoutes(app);
  await registerManagedGatewayRoutes(app);
  await registerLlmProxyRoutes(app);
  await registerCursorGatewayRoutes(app);
  await registerUsageEventRoutes(app);
  await registerDashboardRoutes(app);
  await registerPolicyRoutes(app);
  await registerBillingRoutes(app);

  return app;
}
