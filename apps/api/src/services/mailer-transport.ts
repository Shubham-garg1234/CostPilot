import nodemailer from "nodemailer";
import { getEnvConfig } from "../config.js";
import { isBrevoApiConfigured, sendBrevoTransactionalEmail, type BrevoTransactionalEmail } from "./brevo-mailer.js";

type EnvConfig = ReturnType<typeof getEnvConfig>;

type InternalMailerConfig = {
  provider: "internal";
  service?: string;
  host?: string;
  port?: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from?: string;
};

function getInternalMailerConfig(env: EnvConfig): InternalMailerConfig {
  return {
    provider: "internal",
    service: env.NODEMAILER_SERVICE,
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_USER
  };
}

function isInternalSmtpConfigured(env: EnvConfig) {
  const mailer = getInternalMailerConfig(env);
  const hasSmtpHost = Boolean(mailer.host && mailer.port);
  const hasNodemailerService = Boolean(mailer.service);
  return Boolean((hasSmtpHost || hasNodemailerService) && mailer.user && mailer.pass && mailer.from);
}

/** True when outbound email can be sent for the active MAIL_PROVIDER. */
export function isEmailConfigured(env = getEnvConfig()) {
  if (env.MAIL_PROVIDER === "brevo") {
    return isBrevoApiConfigured(env);
  }
  return isInternalSmtpConfigured(env);
}

/** @deprecated Use isEmailConfigured */
export const isSmtpConfigured = isEmailConfigured;

export function createSmtpTransporter(env = getEnvConfig()) {
  const timeoutMs = env.SMTP_TIMEOUT_MS;
  const mailer = getInternalMailerConfig(env);

  if (mailer.service) {
    return nodemailer.createTransport({
      service: mailer.service,
      auth: {
        user: mailer.user,
        pass: mailer.pass
      },
      connectionTimeout: timeoutMs,
      greetingTimeout: timeoutMs,
      socketTimeout: timeoutMs
    });
  }

  return nodemailer.createTransport({
    host: mailer.host,
    port: mailer.port,
    secure: mailer.secure,
    auth: {
      user: mailer.user,
      pass: mailer.pass
    },
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs
  });
}

export async function sendMailWithTimeout(
  transporter: nodemailer.Transporter,
  mail: nodemailer.SendMailOptions,
  timeoutMs: number
) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      transporter.sendMail(mail),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("SMTP send timed out")), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function sendTransactionalEmail(mail: BrevoTransactionalEmail, env = getEnvConfig()) {
  if (env.MAIL_PROVIDER === "brevo") {
    await sendBrevoTransactionalEmail(mail, env);
    return;
  }

  if (!env.EMAIL_FROM) {
    throw new Error("EMAIL_FROM is not configured.");
  }

  const transporter = createSmtpTransporter(env);

  try {
    await sendMailWithTimeout(
      transporter,
      {
        from: env.EMAIL_FROM,
        to: mail.to,
        subject: mail.subject,
        text: mail.text
      },
      env.SMTP_TIMEOUT_MS
    );
  } finally {
    transporter.close();
  }
}
