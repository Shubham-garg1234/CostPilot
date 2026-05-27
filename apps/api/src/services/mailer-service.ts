import { getEnvConfig } from "../config.js";
import { createSmtpTransporter, isSmtpConfigured, sendMailWithTimeout } from "./mailer-transport.js";

function smtpFailureReason(error: unknown): "SMTP send timed out" | "Email delivery failed." {
  const message = error instanceof Error ? error.message : "";
  if (/timed out/i.test(message)) {
    return "SMTP send timed out";
  }
  return "Email delivery failed.";
}

export async function sendEmployeeCredentialsEmail(input: {
  to: string;
  fullName: string;
  organizationName: string;
  organizationId: string;
  password: string;
}) {
  const env = getEnvConfig();
  if (!isSmtpConfigured(env)) {
    return { delivered: false, reason: "SMTP is not configured." };
  }

  const transporter = createSmtpTransporter(env);

  try {
    await sendMailWithTimeout(
      transporter,
      {
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
      },
      env.SMTP_TIMEOUT_MS
    );
  } catch (error) {
    return { delivered: false, reason: smtpFailureReason(error) };
  } finally {
    transporter.close();
  }

  return { delivered: true as const };
}

export async function sendEmployeePasswordResetEmail(input: { to: string; fullName: string; resetUrl: string }) {
  const env = getEnvConfig();
  if (!isSmtpConfigured(env)) {
    return { delivered: false as const, reason: "SMTP is not configured." };
  }

  const transporter = createSmtpTransporter(env);

  try {
    await sendMailWithTimeout(
      transporter,
      {
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
      },
      env.SMTP_TIMEOUT_MS
    );
  } catch (error) {
    return { delivered: false as const, reason: smtpFailureReason(error) };
  } finally {
    transporter.close();
  }

  return { delivered: true as const };
}
