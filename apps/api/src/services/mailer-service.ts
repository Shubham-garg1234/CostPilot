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
          "After signing in, open the employee dashboard and choose your coding agent to complete CostPilot MCP setup."
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

export async function sendDailyTokenQuotaExhaustedEmails(input: {
  employee: {
    email: string;
    fullName: string;
    role: string;
  };
  organization: {
    name: string;
  };
  heads: Array<{
    email: string;
    fullName: string;
  }>;
  quota: {
    category: string;
    feature?: string | null;
    limit: number;
    used: number;
    requested?: number;
  };
}) {
  const env = getEnvConfig();
  if (!isSmtpConfigured(env)) {
    return { delivered: false as const, reason: "SMTP is not configured." };
  }

  const transporter = createSmtpTransporter(env);
  const featureText = input.quota.feature ? ` / ${input.quota.feature}` : "";
  const requestedText = input.quota.requested
    ? `\nRequested tokens: ${input.quota.requested.toLocaleString("en-US")}`
    : "";

  try {
    await sendMailWithTimeout(
      transporter,
      {
        from: env.EMAIL_FROM,
        to: input.employee.email,
        subject: "Your CostPilot daily token limit is exhausted",
        text: [
          `Hello ${input.employee.fullName},`,
          "",
          `Your daily CostPilot token quota for ${input.quota.category}${featureText} has been exhausted.`,
          `Daily limit: ${input.quota.limit.toLocaleString("en-US")} tokens`,
          `Used today: ${input.quota.used.toLocaleString("en-US")} tokens${requestedText}`,
          "",
          "Further CostPilot-controlled execution for this policy will be blocked until the daily quota resets or your organization updates the policy."
        ].join("\n")
      },
      env.SMTP_TIMEOUT_MS
    );

    if (input.heads.length > 0) {
      await sendMailWithTimeout(
        transporter,
        {
          from: env.EMAIL_FROM,
          to: input.heads.map((head) => head.email).join(","),
          subject: `${input.employee.fullName} exhausted a CostPilot daily token limit`,
          text: [
            `Hello,`,
            "",
            `${input.employee.fullName} (${input.employee.email}, ${input.employee.role}) exhausted the daily CostPilot token quota in ${input.organization.name}.`,
            `Policy scope: ${input.quota.category}${featureText}`,
            `Daily limit: ${input.quota.limit.toLocaleString("en-US")} tokens`,
            `Used today: ${input.quota.used.toLocaleString("en-US")} tokens${requestedText}`,
            "",
            "CostPilot has blocked further controlled execution for this policy until the quota resets or the policy is updated."
          ].join("\n")
        },
        env.SMTP_TIMEOUT_MS
      );
    }
  } catch (error) {
    return { delivered: false as const, reason: smtpFailureReason(error) };
  } finally {
    transporter.close();
  }

  return { delivered: true as const };
}
