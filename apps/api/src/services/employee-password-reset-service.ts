import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { createPasswordHash } from "./employee-auth-service.js";
import { sendEmployeePasswordResetEmail } from "./mailer-service.js";

const RESET_TTL_MS = 60 * 60 * 1000;

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generatePasswordResetToken() {
  return randomBytes(32).toString("hex");
}

export async function requestEmployeePasswordReset(
  app: FastifyInstance,
  input: { email: string; webBaseUrl: string }
): Promise<{ sent: boolean; reason?: string }> {
  if (!app.prisma) {
    throw new Error("PostgreSQL is unavailable.");
  }

  const trimmed = input.email.trim();
  const user = await app.prisma.user.findFirst({
    where: { email: { equals: trimmed, mode: "insensitive" } },
    select: { id: true, fullName: true, passwordHash: true, email: true }
  });

  if (!user?.passwordHash) {
    return { sent: true };
  }

  const rawToken = generatePasswordResetToken();
  const tokenHash = hashPasswordResetToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);

  await app.prisma.$transaction([
    app.prisma.employeePasswordReset.deleteMany({
      where: { userId: user.id, usedAt: null }
    }),
    app.prisma.employeePasswordReset.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt
      }
    })
  ]);

  const resetUrl = `${input.webBaseUrl.replace(/\/$/, "")}/employee/reset-password?token=${encodeURIComponent(rawToken)}`;

  let emailResult: Awaited<ReturnType<typeof sendEmployeePasswordResetEmail>>;
  try {
    emailResult = await sendEmployeePasswordResetEmail({
      to: user.email,
      fullName: user.fullName,
      resetUrl
    });
  } catch {
    await app.prisma.employeePasswordReset.deleteMany({ where: { tokenHash } });
    return { sent: false, reason: "Email delivery failed." };
  }

  if (!emailResult.delivered) {
    await app.prisma.employeePasswordReset.deleteMany({ where: { tokenHash } });
    return { sent: false, reason: emailResult.reason };
  }

  return { sent: true };
}

export async function completeEmployeePasswordReset(
  app: FastifyInstance,
  input: { token: string; newPassword: string }
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!app.prisma) {
    throw new Error("PostgreSQL is unavailable.");
  }

  const tokenHash = hashPasswordResetToken(input.token.trim());
  const record = await app.prisma.employeePasswordReset.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() }
    },
    select: { id: true, userId: true }
  });

  if (!record) {
    return { ok: false, message: "This reset link is invalid or has expired. Request a new one from the login page." };
  }

  const passwordHash = createPasswordHash(input.newPassword);
  const now = new Date();

  await app.prisma.$transaction([
    app.prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, passwordSetAt: now }
    }),
    app.prisma.employeePasswordReset.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: now }
    })
  ]);

  return { ok: true };
}
