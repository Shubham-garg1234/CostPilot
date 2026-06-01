import nodemailer from "nodemailer";
import { getEnvConfig } from "../config.js";

type EnvConfig = ReturnType<typeof getEnvConfig>;

type MailerTransportConfig =
  | {
      provider: "internal";
      service?: string;
      host?: string;
      port?: number;
      secure: boolean;
      user?: string;
      pass?: string;
      from?: string;
    }
  | {
      provider: "brevo";
      host?: string;
      port?: number;
      secure: boolean;
      user?: string;
      pass?: string;
      from?: string;
    };

function getMailerTransportConfig(env: EnvConfig): MailerTransportConfig {
  if (env.MAIL_PROVIDER === "brevo") {
    return {
      provider: "brevo",
      host: env.BREVO_SMTP_HOST,
      port: env.BREVO_SMTP_PORT,
      secure: env.BREVO_SMTP_SECURE,
      user: env.BREVO_SMTP_USER,
      pass: env.BREVO_SMTP_PASS,
      from: env.EMAIL_FROM
    };
  }

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

export function isSmtpConfigured(env = getEnvConfig()) {
  const mailer = getMailerTransportConfig(env);
  const hasSmtpHost = Boolean(mailer.host && mailer.port);
  const hasNodemailerService = mailer.provider === "internal" && Boolean(mailer.service);
  return Boolean((hasSmtpHost || hasNodemailerService) && mailer.user && mailer.pass && mailer.from);
}

export function createSmtpTransporter(env = getEnvConfig()) {
  const timeoutMs = env.SMTP_TIMEOUT_MS;
  const mailer = getMailerTransportConfig(env);

  if (mailer.provider === "internal" && mailer.service) {
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
