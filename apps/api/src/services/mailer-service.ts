import nodemailer from "nodemailer";
import { getEnvConfig } from "../config.js";

export async function sendEmployeeCredentialsEmail(input: {
  to: string;
  fullName: string;
  organizationName: string;
  organizationId: string;
  password: string;
}) {
  const env = getEnvConfig();
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS || !env.EMAIL_FROM) {
    return { delivered: false, reason: "SMTP is not configured." };
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: input.to,
    subject: `Your ${input.organizationName} CostPilot access`,
    text: [
      `Hello ${input.fullName},`,
      "",
      `You have been added to ${input.organizationName} on CostPilot.`,
      "Use these employee credentials to sign in:",
      `Organization ID: ${input.organizationId}`,
      `Email: ${input.to}`,
      `Password: ${input.password}`,
      "",
      "After signing in, you can copy your Cursor MCP configuration directly from the employee dashboard."
    ].join("\n")
  });

  return { delivered: true as const };
}

export async function sendEmployeePasswordResetEmail(input: { to: string; fullName: string; resetUrl: string }) {
  const env = getEnvConfig();
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS || !env.EMAIL_FROM) {
    return { delivered: false as const, reason: "SMTP is not configured." };
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: input.to,
    subject: "Reset your CostPilot employee password",
    text: [
      `Hello ${input.fullName},`,
      "",
      "We received a request to reset your CostPilot employee account password.",
      "Open this link in your browser (it expires in one hour):",
      input.resetUrl,
      "",
      "If you did not request this, you can ignore this email. Your password will not change."
    ].join("\n")
  });

  return { delivered: true as const };
}
