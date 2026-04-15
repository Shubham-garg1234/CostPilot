import type { FastifyReply, FastifyRequest } from "fastify";
import { createClerkClient, verifyToken } from "@clerk/backend";
import { RoleKey } from "@prisma/client";
import { getEnvConfig } from "./config.js";

const fallbackSeedUsers: Record<
  string,
  { userId: string; orgId: string; role: RoleKey; teamId?: string; email: string; name: string }
> = {
  "demo-admin": {
    userId: "user_admin_seed",
    orgId: "acme-org",
    role: RoleKey.ADMIN,
    teamId: "platform-team",
    email: "admin@acme.ai",
    name: "Ava Admin"
  },
  "demo-manager": {
    userId: "user_manager_seed",
    orgId: "acme-org",
    role: RoleKey.MANAGER,
    teamId: "support-team",
    email: "manager@acme.ai",
    name: "Marco Manager"
  },
  "demo-intern": {
    userId: "user_intern_seed",
    orgId: "acme-org",
    role: RoleKey.INTERN,
    teamId: "support-team",
    email: "intern@acme.ai",
    name: "Ivy Intern"
  }
};

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY ?? "sk_test_placeholder"
});

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authMode = getEnvConfig().AUTH_MODE;

  if (authMode === "demo") {
    request.auth = await resolveDemoAuth(request);
    return;
  }

  const token = extractBearerToken(request);
  if (!token) {
    return reply.status(401).send({ message: "Missing Clerk bearer token." });
  }

  const verified = await verifyClerkToken(token);
  if (!verified?.sub) {
    return reply.status(401).send({ message: "Invalid Clerk session token." });
  }

  const clerkUserId = verified.sub;
  const clerkUser = await clerkClient.users.getUser(clerkUserId).catch(() => null);
  const primaryEmail =
    clerkUser?.primaryEmailAddressId
      ? clerkUser.emailAddresses.find((entry) => entry.id === clerkUser.primaryEmailAddressId)?.emailAddress
      : clerkUser?.emailAddresses[0]?.emailAddress;
  const fullName = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ").trim();

  const dbUser = request.server.prisma
    ? await request.server.prisma.user.findFirst({
        where: {
          OR: [
            { clerkUserId },
            ...(primaryEmail ? [{ email: primaryEmail }] : [])
          ]
        },
        include: {
          team: true,
          organization: true
        }
      }).catch(() => null)
    : null;

  if (!dbUser) {
    return reply.status(403).send({
      message: "Clerk user is valid but not linked to a CostPilot user record."
    });
  }

  request.auth = {
    userId: dbUser.id,
    orgId: dbUser.organizationId,
    role: dbUser.role,
    authMode: "clerk",
    teamId: dbUser.teamId,
    email: dbUser.email ?? primaryEmail,
    name: dbUser.fullName || fullName || clerkUser?.username || clerkUserId
  };
}

async function resolveDemoAuth(request: FastifyRequest) {
  const token = request.headers.authorization?.replace("Bearer ", "") ?? "demo-admin";
  const headerRole = request.headers["x-demo-role"];
  const headerTeamId = request.headers["x-demo-team-id"];
  const headerOrgId = request.headers["x-demo-org-id"];
  const parsedToken = parseDemoToken(token);
  const seedAuth = parsedToken ?? fallbackSeedUsers[token] ?? fallbackSeedUsers["demo-admin"];
  const role =
    typeof headerRole === "string" && Object.values(RoleKey).includes(headerRole as RoleKey)
      ? (headerRole as RoleKey)
      : seedAuth.role;

  const dbUser = request.server.prisma
    ? await request.server.prisma.user.findUnique({
        where: { clerkUserId: seedAuth.userId }
      }).catch(() => null)
    : null;

  return dbUser
    ? {
        userId: dbUser.id,
        orgId: dbUser.organizationId,
        role: role ?? dbUser.role,
        authMode: "demo" as const,
        teamId: typeof headerTeamId === "string" ? headerTeamId : dbUser.teamId,
        email: dbUser.email,
        name: dbUser.fullName
      }
    : {
        ...seedAuth,
        orgId: typeof headerOrgId === "string" ? headerOrgId : seedAuth.orgId,
        role,
        teamId: typeof headerTeamId === "string" ? headerTeamId : seedAuth.teamId,
        authMode: "demo" as const
      };
}

function extractBearerToken(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header) {
    return "";
  }

  return header.replace("Bearer ", "").trim();
}

async function verifyClerkToken(token: string) {
  try {
    const env = getEnvConfig();
    const authorizedParties = (env.CLERK_AUTHORIZED_PARTIES ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    return await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
      jwtKey: env.CLERK_JWT_KEY,
      authorizedParties: authorizedParties.length > 0 ? authorizedParties : undefined
    });
  } catch {
    return null;
  }
}

function parseDemoToken(token: string) {
  if (!token.startsWith("demo:")) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(token.slice(5), "base64url").toString("utf8")) as {
      userId: string;
      orgId: string;
      role: RoleKey;
      teamId?: string;
      email: string;
      name: string;
    };

    return payload;
  } catch {
    return null;
  }
}

export function createDemoToken(input: {
  userId: string;
  orgId: string;
  role: RoleKey;
  teamId?: string | null;
  email: string;
  name: string;
}) {
  return `demo:${Buffer.from(JSON.stringify(input)).toString("base64url")}`;
}
