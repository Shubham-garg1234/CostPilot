import { getEnvConfig } from "../config.js";
import { formatBrevoError } from "./brevo-mailer.js";
import { isEmailConfigured, sendTransactionalEmail } from "./mailer-transport.js";

function emailFailureReason(error: unknown) {
  return formatBrevoError(error);
}

export async function sendEmployeeCredentialsEmail(input: {
  to: string;
  fullName: string;
  organizationName: string;
  organizationId: string;
  password: string;
}) {
  const env = getEnvConfig();
  if (!isEmailConfigured(env)) {
    return { delivered: false, reason: "Email is not configured." };
  }

  try {
    await sendTransactionalEmail({
      to: input.to,
      toName: input.fullName,
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
    });
  } catch (error) {
    return { delivered: false, reason: emailFailureReason(error) };
  }

  return { delivered: true as const };
}

export async function sendEmployeePasswordResetEmail(input: { to: string; fullName: string; resetUrl: string }) {
  const env = getEnvConfig();
  if (!isEmailConfigured(env)) {
    return { delivered: false as const, reason: "Email is not configured." };
  }

  try {
    await sendTransactionalEmail({
      to: input.to,
      toName: input.fullName,
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
  } catch (error) {
    return { delivered: false as const, reason: emailFailureReason(error) };
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
  if (!isEmailConfigured(env)) {
    return { delivered: false as const, reason: "Email is not configured." };
  }

  const featureText = input.quota.feature ? ` / ${input.quota.feature}` : "";
  const requestedText = input.quota.requested
    ? `\nRequested tokens: ${input.quota.requested.toLocaleString("en-US")}`
    : "";

  try {
    await sendTransactionalEmail({
      to: input.employee.email,
      toName: input.employee.fullName,
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
    });

    if (input.heads.length > 0) {
      await sendTransactionalEmail({
        to: input.heads.map((head) => head.email),
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
      });
    }
  } catch (error) {
    return { delivered: false as const, reason: emailFailureReason(error) };
  }

  return { delivered: true as const };
}
