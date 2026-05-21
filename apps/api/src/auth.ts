import type { FastifyReply, FastifyRequest } from "fastify";
import { RoleKey } from "@prisma/client";
import { createClerkClient, verifyToken } from "@clerk/backend";
import { getEnvConfig } from "./config.js";
import { verifyEmployeeAccessToken } from "./services/employee-auth-service.js";
import type { AuthContext } from "./types.js";

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY ?? "sk_test_placeholder"
});

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const env = getEnvConfig();
  const token = extractBearerToken(request);
  if (!token) {
    return reply.status(401).send({ message: "Missing access token." });
  }

  const employeeToken = verifyEmployeeAccessToken(token, env.EMPLOYEE_AUTH_SECRET);
  if (employeeToken) {
    request.auth = {
      userId: employeeToken.userId,
      orgId: employeeToken.orgId,
      role: employeeToken.role,
      authMode: "employee",
      teamId: employeeToken.teamId,
      email: employeeToken.email,
      name: employeeToken.name
    };
    return;
  }

  const verified = await verifyClerkToken(token);
  if (!verified?.sub) {
    return reply.status(401).send({ message: "Invalid Clerk session token." });
  }

  if (!request.server.prisma) {
    return reply.status(503).send({ message: "PostgreSQL is unavailable." });
  }

  const identity = await getClerkIdentity(verified.sub);

  let dbUser = await findDbUserForClerkIdentity(request, identity);

  if (!dbUser) {
    dbUser = await bootstrapInitialUser({
      clerkUserId: identity.clerkUserId,
      primaryEmail: identity.primaryEmail,
      fullName: identity.fullName,
      prisma: request.server.prisma
    });
  }

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
    email: dbUser.email ?? identity.primaryEmail,
    name: dbUser.fullName || identity.displayName
  };
}

export async function authenticateOrganizationSetup(request: FastifyRequest, reply: FastifyReply) {
  const env = getEnvConfig();
  const token = extractBearerToken(request);
  if (!token) {
    return reply.status(401).send({ message: "Missing access token." });
  }

  const employeeToken = verifyEmployeeAccessToken(token, env.EMPLOYEE_AUTH_SECRET);
  if (employeeToken) {
    request.auth = {
      userId: employeeToken.userId,
      orgId: employeeToken.orgId,
      role: employeeToken.role,
      authMode: "employee",
      teamId: employeeToken.teamId,
      email: employeeToken.email,
      name: employeeToken.name
    };
    return;
  }

  const verified = await verifyClerkToken(token);
  if (!verified?.sub) {
    return reply.status(401).send({ message: "Invalid Clerk session token." });
  }

  if (!request.server.prisma) {
    return reply.status(503).send({ message: "PostgreSQL is unavailable." });
  }

  const identity = await getClerkIdentity(verified.sub);
  const dbUser = await findDbUserForClerkIdentity(request, identity);
  if (dbUser) {
    request.auth = toAuthContext(dbUser, identity);
    return;
  }

  if (!identity.primaryEmail) {
    return reply.status(403).send({ message: "Your Clerk account needs an email before creating an organization." });
  }

  request.organizationSetupAuth = {
    clerkUserId: identity.clerkUserId,
    email: identity.primaryEmail,
    name: identity.displayName
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
    const jwtKey = normalizeClerkJwtKey(env.CLERK_JWT_KEY);

    return await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
      jwtKey,
      authorizedParties: authorizedParties.length > 0 ? authorizedParties : undefined
    });
  } catch {
    return null;
  }
}

function normalizeClerkJwtKey(value?: string) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  // Ignore placeholder values so local/dev auth can still verify via Clerk.
  if (trimmed.includes("this-is-meant-to-be-secret") || trimmed.endsWith("_xxx") || trimmed === "placeholder") {
    return undefined;
  }

  return trimmed;
}

async function getClerkIdentity(clerkUserId: string) {
  const clerkUser = await clerkClient.users.getUser(clerkUserId).catch(() => null);
  const primaryEmail =
    clerkUser?.primaryEmailAddressId
      ? clerkUser.emailAddresses.find((entry) => entry.id === clerkUser.primaryEmailAddressId)?.emailAddress
      : clerkUser?.emailAddresses[0]?.emailAddress;
  const fullName = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ").trim();

  return {
    clerkUserId,
    primaryEmail,
    fullName,
    displayName: fullName || primaryEmail || clerkUser?.username || clerkUserId
  };
}

async function findDbUserForClerkIdentity(
  request: FastifyRequest,
  identity: Awaited<ReturnType<typeof getClerkIdentity>>
) {
  return await request.server.prisma?.user.findFirst({
    where: {
      OR: [
        { clerkUserId: identity.clerkUserId },
        ...(identity.primaryEmail ? [{ email: identity.primaryEmail }] : [])
      ]
    },
    include: {
      team: true,
      organization: true
    }
  }).catch(() => null);
}

function toAuthContext(
  dbUser: NonNullable<Awaited<ReturnType<typeof findDbUserForClerkIdentity>>>,
  identity: Awaited<ReturnType<typeof getClerkIdentity>>
): AuthContext {
  return {
    userId: dbUser.id,
    orgId: dbUser.organizationId,
    role: dbUser.role,
    authMode: "clerk",
    teamId: dbUser.teamId,
    email: dbUser.email ?? identity.primaryEmail,
    name: dbUser.fullName || identity.displayName
  };
}

async function bootstrapInitialUser(input: {
  clerkUserId: string;
  primaryEmail?: string;
  fullName?: string;
  prisma: NonNullable<FastifyRequest["server"]["prisma"]>;
}) {
  const orgCount = await input.prisma.organization.count().catch(() => 0);
  const userCount = await input.prisma.user.count().catch(() => 0);

  if (orgCount > 0 || userCount > 0 || !input.primaryEmail) {
    return null;
  }

  const orgName = input.fullName?.trim() ? `${input.fullName.trim()}'s Workspace` : "CostPilot Workspace";
  const orgSlugBase = slugify(orgName);
  const slug = await uniqueOrganizationSlug(input.prisma, orgSlugBase);

  const organization = await input.prisma.organization.create({
    data: {
      name: orgName,
      slug
    }
  });

  return input.prisma.user.create({
    data: {
      clerkUserId: input.clerkUserId,
      email: input.primaryEmail,
      fullName: input.fullName?.trim() || input.primaryEmail,
      organizationId: organization.id,
      role: RoleKey.ADMIN
    },
    include: {
      team: true,
      organization: true
    }
  });
}

async function uniqueOrganizationSlug(
  prisma: NonNullable<FastifyRequest["server"]["prisma"]>,
  base: string
) {
  let attempt = base || "costpilot-workspace";
  let suffix = 1;

  while (await prisma.organization.findUnique({ where: { slug: attempt } })) {
    suffix += 1;
    attempt = `${base}-${suffix}`;
  }

  return attempt;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
