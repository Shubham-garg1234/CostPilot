import type { FastifyReply, FastifyRequest } from "fastify";
import { RoleKey } from "@prisma/client";

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

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authMode = (process.env.AUTH_MODE ?? "demo") as "demo" | "clerk";

  if (authMode === "demo") {
    request.auth = await resolveDemoAuth(request);
    return;
  }

  const authHeader = request.headers.authorization?.replace("Bearer ", "");
  const dbUser = authHeader && request.server.prisma
    ? await request.server.prisma.user.findFirst({
        where: {
          OR: [{ clerkUserId: authHeader }, { email: authHeader }]
        },
        include: {
          team: true,
          organization: true
        }
      }).catch(() => null)
    : null;

  if (dbUser) {
    request.auth = {
      userId: dbUser.id,
      orgId: dbUser.organizationId,
      role: dbUser.role,
      authMode: "clerk",
      teamId: dbUser.teamId,
      email: dbUser.email,
      name: dbUser.fullName
    };
    return;
  }

  return reply.status(401).send({ message: "Missing or invalid Clerk user." });
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
