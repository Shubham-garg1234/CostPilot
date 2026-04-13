import type { FastifyInstance } from "fastify";

export async function dispatchAlert(
  app: FastifyInstance,
  payload: { title: string; message: string; severity: "info" | "warning" | "critical" }
) {
  app.log.info({ alert: payload }, "Alert queued");

  if (process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `[${payload.severity.toUpperCase()}] ${payload.title}: ${payload.message}`
      })
    }).catch(() => undefined);
  }
}

