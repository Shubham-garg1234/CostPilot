import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { getEnvConfig } from "../config.js";
import { RoleKey, roleKeyValues } from "../db/types.js";
import { findUserByEmailInsensitive, findUserWithOrganization } from "../db/index.js";
import { createEmployeeAccessToken, verifyPassword } from "../services/employee-auth-service.js";
import { isEmailConfigured } from "../services/mailer-transport.js";
import {
  completeEmployeePasswordReset,
  requestEmployeePasswordReset
} from "../services/employee-password-reset-service.js";
import { getEmployeeDashboard } from "../services/employee-dashboard-service.js";
import { getOrganizationSnapshot } from "../services/organization-service.js";

const employeeLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6, "Password must be at least 6 characters.")
});

const employeeForgotPasswordSchema = z.object({
  email: z.string().trim().email()
});

const employeeResetPasswordSchema = z.object({
  token: z.string().trim().min(32),
  password: z.string().min(8).max(128)
});

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/auth/employee-login", async (request, reply) => {
    if (!app.db) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    const body = employeeLoginSchema.parse(request.body);
    const env = getEnvConfig();
    const user = await findUserByEmailInsensitive(app.db, body.email);

    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      return reply.status(401).send({ message: "Invalid email or password." });
    }

    const profile = await findUserWithOrganization(app.db, user.id);
    if (!profile) {
      return reply.status(401).send({ message: "Invalid email or password." });
    }

    const token = createEmployeeAccessToken(
      {
        userId: user.id,
        orgId: user.organizationId,
        role: user.role,
        teamId: user.teamId,
        email: user.email,
        name: user.fullName
      },
      env.EMPLOYEE_AUTH_SECRET
    );

    return {
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        orgId: user.organizationId,
        organizationName: profile.organization.name,
        organizationSlug: profile.organization.slug,
        role: user.role
      }
    };
  });

  app.post("/api/auth/employee-forgot-password", async (request, reply) => {
    if (!app.db) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    const body = employeeForgotPasswordSchema.parse(request.body);
    const env = getEnvConfig();
    const webBase = resolveEmployeeWebBaseUrl(request, env);
    if (!webBase) {
      return reply.status(503).send({
        message:
          "Password reset is not available: set NEXT_PUBLIC_APP_URL in the API environment, or submit this form from the CostPilot web app in your browser."
      });
    }

    try {
      const result = await requestEmployeePasswordReset(app, {
        email: body.email,
        webBaseUrl: webBase
      });

      if (!result.sent) {
        request.log.warn(
          {
            forgotPasswordOutcome: "email_not_sent",
            reason: result.reason,
            emailConfigured: isEmailConfigured(env)
          },
          "employee-forgot-password: mail was not delivered"
        );
        const isNotConfigured =
          result.reason === "Email is not configured." || result.reason === "SMTP is not configured.";
        const isTimeout = result.reason === "SMTP send timed out";
        const isIpBlocked = /blocked this server ip|unrecognised ip|authorized_ips|authorised_ips/i.test(
          result.reason ?? ""
        );
        return reply.status(503).send({
          message: isNotConfigured
            ? "Password reset email is not available because outbound email is not configured on this server. Contact your organization administrator."
            : isIpBlocked
              ? "Unable to send the reset email: Brevo is blocking this server's IP. In Brevo → Security → Authorized IPs, disable the restriction or add your Render server IP."
              : isTimeout || result.reason === "Email delivery failed."
                ? "Unable to send the reset email (mail server timeout or connection issue). Try again later or contact your administrator."
                : result.reason && result.reason.length < 220
                  ? `Unable to send the reset email: ${result.reason}`
                  : "Unable to send the reset email right now. Try again later or contact your administrator."
        });
      }

      return {
        message: "If that email is registered as an employee account, we sent password reset instructions."
      };
    } catch (error) {
      request.log.error({ err: error }, "employee-forgot-password failed");
      return reply.status(503).send({
        message:
          "Unable to process your password reset request right now. Try again in a few minutes or contact your administrator."
      });
    }
  });

  app.post("/api/auth/employee-reset-password", async (request, reply) => {
    if (!app.db) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    const body = employeeResetPasswordSchema.parse(request.body);

    try {
      const outcome = await completeEmployeePasswordReset(app, {
        token: body.token,
        newPassword: body.password
      });

      if (!outcome.ok) {
        return reply.status(400).send({ message: outcome.message });
      }

      return {
        ok: true,
        message: "Your password was updated. You can sign in with your new password."
      };
    } catch (error) {
      request.log.error({ err: error }, "employee-reset-password failed");
      return reply.status(503).send({
        message: "Unable to reset your password right now. Try again in a few minutes."
      });
    }
  });

  app.get("/api/auth/session", { preHandler: [authenticate] }, async (request, reply) => {
    const env = getEnvConfig();
    if (!app.db) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    const snapshot = await getOrganizationSnapshot(app, request.auth.orgId);

    return {
      authMode: request.auth.authMode,
      clerkEnabled: env.AUTH_MODE === "clerk",
      user: request.auth,
      availableRoles: roleKeyValues,
      availableTeams: snapshot.teams
    };
  });

  app.get("/api/auth/employee-dashboard", { preHandler: [authenticate] }, async (request, reply) => {
    if (request.auth.authMode !== "employee") {
      return reply.status(403).send({ message: "Employee dashboard is only available for employee login sessions." });
    }

    const env = getEnvConfig();
    return await getEmployeeDashboard(app, {
      orgId: request.auth.orgId,
      userId: request.auth.userId,
      email: request.auth.email,
      apiBaseUrl: resolvePublicApiBaseUrl(request, env)
    });
  });

  app.post("/api/auth/logout", async () => {
    return { ok: true };
  });
}

function resolveEmployeeWebBaseUrl(request: FastifyRequest, env: ReturnType<typeof getEnvConfig>): string | null {
  const fromEnv = env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }

  const origin = request.headers.origin;
  if (origin && /^https?:\/\//i.test(origin)) {
    try {
      return new URL(origin).origin.replace(/\/$/, "");
    } catch {
      // fall through to Referer
    }
  }

  const referer = request.headers.referer;
  if (referer && /^https?:\/\//i.test(referer)) {
    try {
      return new URL(referer).origin.replace(/\/$/, "");
    } catch {
      return null;
    }
  }

  return null;
}

function resolvePublicApiBaseUrl(request: FastifyRequest, env: ReturnType<typeof getEnvConfig>) {
  if (env.COSTPILOT_API_URL) {
    return env.COSTPILOT_API_URL;
  }

  if (env.NEXT_PUBLIC_API_URL) {
    return env.NEXT_PUBLIC_API_URL;
  }

  const forwardedProto = request.headers["x-forwarded-proto"];
  const forwardedHost = request.headers["x-forwarded-host"];
  const host = forwardedHost || request.headers.host;
  const protocol = forwardedProto || request.protocol || "https";

  return `${protocol}://${host}`;
}
