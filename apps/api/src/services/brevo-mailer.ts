import { getEnvConfig } from "../config.js";

type EnvConfig = ReturnType<typeof getEnvConfig>;

export type BrevoRecipient = {
  email: string;
  name?: string;
};

export type BrevoTransactionalEmail = {
  to: string | string[];
  subject: string;
  text: string;
  toName?: string;
};

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

function parseBrevoErrorBody(body: string, status: number) {
  try {
    const parsed = JSON.parse(body) as { message?: string; code?: string };
    if (parsed.message) {
      return `Brevo API ${status}: ${parsed.message}`;
    }
  } catch {
    // fall through
  }
  return `Brevo API ${status}: ${body.slice(0, 300)}`;
}

export function formatBrevoError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Email delivery failed.";
  }
  if (/timed out/i.test(error.message)) {
    return "SMTP send timed out";
  }
  if (/unrecognised ip address|authorized_ips|authorised_ips/i.test(error.message)) {
    return "Email delivery failed: Brevo blocked this server IP. Disable IP allowlisting in Brevo Security or add this host to authorized IPs.";
  }
  if (error.message.startsWith("Brevo API")) {
    return error.message.length > 240 ? `${error.message.slice(0, 240)}…` : error.message;
  }
  return "Email delivery failed.";
}

export function isBrevoApiConfigured(env = getEnvConfig()) {
  return Boolean(env.BREVO_API_KEY && env.EMAIL_FROM);
}

export function normalizeBrevoRecipients(to: string | string[], toName?: string): BrevoRecipient[] {
  const addresses = (Array.isArray(to) ? to : to.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);

  return addresses.map((email, index) => {
    const recipient: BrevoRecipient = { email };
    if (index === 0 && addresses.length === 1 && toName?.trim()) {
      recipient.name = toName.trim();
    }
    return recipient;
  });
}

export async function sendBrevoTransactionalEmail(
  input: BrevoTransactionalEmail,
  env: EnvConfig = getEnvConfig()
) {
  const apiKey = env.BREVO_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();

  if (!apiKey || !from) {
    throw new Error("Brevo API is not configured.");
  }

  const recipients = normalizeBrevoRecipients(input.to, input.toName);
  if (!recipients.length) {
    throw new Error("At least one recipient is required.");
  }

  const timeoutMs = env.SMTP_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(BREVO_SEND_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": apiKey
      },
      body: JSON.stringify({
        sender: {
          name: env.EMAIL_FROM_NAME ?? "CostPilot",
          email: from
        },
        to: recipients,
        subject: input.subject,
        textContent: input.text
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(parseBrevoErrorBody(body, response.status));
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Email send timed out");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
