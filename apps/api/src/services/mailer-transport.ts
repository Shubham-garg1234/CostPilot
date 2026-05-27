import nodemailer from "nodemailer";
import { getEnvConfig } from "../config.js";

export function isSmtpConfigured(env = getEnvConfig()) {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS && env.EMAIL_FROM);
}

export function createSmtpTransporter(env = getEnvConfig()) {
  const timeoutMs = env.SMTP_TIMEOUT_MS;

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
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
