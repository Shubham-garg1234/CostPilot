import type { FastifyInstance } from "fastify";
import { insertActivityLog, type ActivityLogInput } from "../db/index.js";

export async function recordActivity(app: FastifyInstance, input: ActivityLogInput) {
  if (!app.db) {
    return null;
  }

  try {
    return await insertActivityLog(app.db, input);
  } catch (error) {
    app.log.warn(
      {
        error,
        eventType: input.eventType,
        requestId: input.requestId
      },
      "Activity log write failed"
    );
    return null;
  }
}
