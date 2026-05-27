import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  completePasswordReset,
  deletePasswordResetByTokenHash,
  findValidPasswordReset,
  replacePendingPasswordReset
} from "../db/password-resets.js";
import { findUserByEmailInsensitive } from "../db/users.js";
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
  if (!app.db) {
    throw new Error("PostgreSQL is unavailable.");
  }

  const trimmed = input.email.trim();
  const user = await findUserByEmailInsensitive(app.db, trimmed);

  if (!user?.passwordHash) {
    return { sent: true };
  }

  const rawToken = generatePasswordResetToken();
  const tokenHash = hashPasswordResetToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);

  await replacePendingPasswordReset(app.db, user.id, tokenHash, expiresAt);

  const resetUrl = `${input.webBaseUrl.replace(/\/$/, "")}/employee/reset-password?token=${encodeURIComponent(rawToken)}`;

  let emailResult: Awaited<ReturnType<typeof sendEmployeePasswordResetEmail>>;
  try {
    emailResult = await sendEmployeePasswordResetEmail({
      to: user.email,
      fullName: user.fullName,
      resetUrl
    });
  } catch (error) {
    await deletePasswordResetByTokenHash(app.db, tokenHash);
    const message = error instanceof Error ? error.message : "Email delivery failed.";
    return {
      sent: false,
      reason: message.includes("timed out") ? "SMTP send timed out" : "Email delivery failed."
    };
  }

  if (!emailResult.delivered) {
    await deletePasswordResetByTokenHash(app.db, tokenHash);
    return { sent: false, reason: emailResult.reason };
  }

  return { sent: true };
}

export async function completeEmployeePasswordReset(
  app: FastifyInstance,
  input: { token: string; newPassword: string }
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!app.db) {
    throw new Error("PostgreSQL is unavailable.");
  }

  const tokenHash = hashPasswordResetToken(input.token.trim());
  const record = await findValidPasswordReset(app.db, tokenHash);

  if (!record) {
    return { ok: false, message: "This reset link is invalid or has expired. Request a new one from the login page." };
  }

  const passwordHash = createPasswordHash(input.newPassword);
  const now = new Date();

  await completePasswordReset(app.db, record.userId, passwordHash, now);

  return { ok: true };
}
