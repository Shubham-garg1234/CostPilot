import dayjs from "dayjs";
import type { FastifyInstance } from "fastify";

export async function generateMonthlyBilling(app: FastifyInstance, orgId: string) {
  if (!app.prisma) {
    throw new Error("PostgreSQL is unavailable.");
  }

  const organization = await app.prisma.organization.findUnique({
    where: { id: orgId }
  });

  if (!organization) {
    throw new Error("Organization not found.");
  }

  const periodStart = dayjs().startOf("month").toDate();
  const periodEnd = dayjs().endOf("month").toDate();

  const aggregates = await app.prisma.usageAggregate.aggregate({
    where: {
      orgId,
      monthBucket: periodStart
    },
    _sum: { costUsd: true }
  });

  const rawCost = Number(aggregates._sum.costUsd ?? 0);
  const markup = Number(organization.markupPercentage);
  const finalCost = rawCost + rawCost * (markup / 100);

  return app.prisma.billingRecord.create({
    data: {
      orgId,
      periodStart,
      periodEnd,
      rawCostUsd: rawCost,
      markupPercentage: markup,
      finalCostUsd: finalCost
    }
  });
}
