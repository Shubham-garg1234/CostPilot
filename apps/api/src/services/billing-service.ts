import dayjs from "dayjs";
import type { FastifyInstance } from "fastify";
import { createBillingRecord, getOrganizationMarkupPercentage, sumUsageCostForMonth } from "../db/index.js";

export async function generateMonthlyBilling(app: FastifyInstance, orgId: string) {
  if (!app.db) {
    throw new Error("PostgreSQL is unavailable.");
  }

  const markup = await getOrganizationMarkupPercentage(app.db, orgId);
  const periodStart = dayjs().startOf("month").toDate();
  const periodEnd = dayjs().endOf("month").toDate();
  const rawCost = await sumUsageCostForMonth(app.db, orgId, periodStart);
  const finalCost = rawCost + rawCost * (markup / 100);

  return createBillingRecord(app.db, {
    orgId,
    periodStart,
    periodEnd,
    rawCostUsd: rawCost,
    markupPercentage: markup,
    finalCostUsd: finalCost
  });
}
