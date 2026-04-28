import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from "node:crypto";
import {
  ManagedClientType,
  ManagedCursorComplianceStatus,
  ManagedGatewayKeyStatus
} from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { getEnvConfig } from "../config.js";
import type { AuthContext } from "../types.js";

const MANAGED_KEY_PREFIX = "cpgk";

export type ManagedGatewayKeySummary = {
  id: string;
  name: string;
  clientType: ManagedClientType;
  status: ManagedGatewayKeyStatus;
  secretPreview: string;
  issuedBy?: string | null;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export class ManagedGatewayKeyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManagedGatewayKeyConflictError";
  }
}

export class ManagedGatewayKeyNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManagedGatewayKeyNotFoundError";
  }
}

export class ManagedGatewayAuthError extends Error {
  constructor(
    message: string,
    readonly statusCode = 401
  ) {
    super(message);
    this.name = "ManagedGatewayAuthError";
  }
}

export async function issueManagedGatewayKey(
  app: FastifyInstance,
  input: {
    orgId: string;
    userId: string;
    name: string;
    clientType: ManagedClientType;
    issuedBy?: string;
    expiresAt?: Date;
  }
) {
  if (!app.prisma) {
    throw new Error("PostgreSQL is unavailable.");
  }

  return await app.prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: {
        id: input.userId,
        organizationId: input.orgId
      }
    });

    if (!user) {
      throw new ManagedGatewayKeyNotFoundError("User not found in this organization.");
    }

    const existingActiveKey = await tx.managedGatewayKey.findFirst({
      where: {
        orgId: input.orgId,
        userId: input.userId,
        clientType: input.clientType,
        status: ManagedGatewayKeyStatus.ACTIVE
      }
    });

    if (existingActiveKey) {
      throw new ManagedGatewayKeyConflictError("An active managed gateway key already exists for this user.");
    }

    const secret = createManagedGatewaySecret();
    const keyId = randomUUID();
    const plaintextKey = formatManagedGatewayKey(keyId, secret);
    const createdKey = await tx.managedGatewayKey.create({
      data: {
        id: keyId,
        orgId: input.orgId,
        userId: input.userId,
        name: input.name,
        clientType: input.clientType,
        encryptedSecret: encryptSecret(secret),
        secretPreview: secret.slice(-6),
        issuedBy: input.issuedBy,
        expiresAt: input.expiresAt,
        status: ManagedGatewayKeyStatus.ACTIVE
      }
    });

    if (input.clientType === ManagedClientType.CURSOR) {
      await tx.user.update({
        where: { id: input.userId },
        data: {
          cursorComplianceStatus: ManagedCursorComplianceStatus.PENDING,
          cursorComplianceUpdatedAt: new Date()
        }
      });
    }

    return {
      secret: plaintextKey,
      key: serializeManagedGatewayKey(createdKey)
    };
  });
}

export async function rotateManagedGatewayKey(
  app: FastifyInstance,
  input: {
    orgId: string;
    keyId: string;
    issuedBy?: string;
    expiresAt?: Date;
  }
) {
  if (!app.prisma) {
    throw new Error("PostgreSQL is unavailable.");
  }

  return await app.prisma.$transaction(async (tx) => {
    const existingKey = await tx.managedGatewayKey.findFirst({
      where: {
        id: input.keyId,
        orgId: input.orgId
      }
    });

    if (!existingKey) {
      throw new ManagedGatewayKeyNotFoundError("Managed gateway key not found.");
    }

    if (existingKey.status !== ManagedGatewayKeyStatus.ACTIVE) {
      throw new ManagedGatewayKeyConflictError("Only active managed gateway keys can be rotated.");
    }

    await tx.managedGatewayKey.update({
      where: { id: existingKey.id },
      data: { status: ManagedGatewayKeyStatus.ROTATED }
    });

    const secret = createManagedGatewaySecret();
    const keyId = randomUUID();
    const plaintextKey = formatManagedGatewayKey(keyId, secret);
    const createdKey = await tx.managedGatewayKey.create({
      data: {
        id: keyId,
        orgId: existingKey.orgId,
        userId: existingKey.userId,
        name: existingKey.name,
        clientType: existingKey.clientType,
        encryptedSecret: encryptSecret(secret),
        secretPreview: secret.slice(-6),
        issuedBy: input.issuedBy,
        expiresAt: input.expiresAt ?? existingKey.expiresAt,
        status: ManagedGatewayKeyStatus.ACTIVE
      }
    });

    if (existingKey.clientType === ManagedClientType.CURSOR) {
      await tx.user.update({
        where: { id: existingKey.userId },
        data: {
          cursorComplianceStatus: ManagedCursorComplianceStatus.PENDING,
          cursorComplianceUpdatedAt: new Date()
        }
      });
    }

    return {
      secret: plaintextKey,
      key: serializeManagedGatewayKey(createdKey)
    };
  });
}

export async function revokeManagedGatewayKey(
  app: FastifyInstance,
  input: {
    orgId: string;
    keyId: string;
  }
) {
  if (!app.prisma) {
    throw new Error("PostgreSQL is unavailable.");
  }

  return await app.prisma.$transaction(async (tx) => {
    const existingKey = await tx.managedGatewayKey.findFirst({
      where: {
        id: input.keyId,
        orgId: input.orgId
      }
    });

    if (!existingKey) {
      throw new ManagedGatewayKeyNotFoundError("Managed gateway key not found.");
    }

    const revokedKey = await tx.managedGatewayKey.update({
      where: { id: existingKey.id },
      data: { status: ManagedGatewayKeyStatus.REVOKED }
    });

    if (existingKey.clientType === ManagedClientType.CURSOR) {
      await tx.user.update({
        where: { id: existingKey.userId },
        data: {
          cursorComplianceStatus: ManagedCursorComplianceStatus.PENDING,
          cursorComplianceUpdatedAt: new Date()
        }
      });
    }

    return serializeManagedGatewayKey(revokedKey);
  });
}

export async function resolveManagedGatewayAuth(
  app: FastifyInstance,
  presentedKey: string,
  expectedClientType = ManagedClientType.CURSOR
): Promise<AuthContext> {
  if (!app.prisma) {
    throw new ManagedGatewayAuthError("PostgreSQL is unavailable.", 503);
  }

  const parsed = parseManagedGatewayKey(presentedKey);
  if (!parsed) {
    throw new ManagedGatewayAuthError("Managed gateway key is malformed.");
  }

  const keyRecord = await app.prisma.managedGatewayKey.findUnique({
    where: { id: parsed.keyId },
    include: {
      user: true
    }
  });

  if (!keyRecord || keyRecord.clientType !== expectedClientType) {
    throw new ManagedGatewayAuthError("Managed gateway key is invalid.");
  }

  if (keyRecord.status !== ManagedGatewayKeyStatus.ACTIVE) {
    throw new ManagedGatewayAuthError("Managed gateway key is no longer active.");
  }

  if (keyRecord.expiresAt && keyRecord.expiresAt <= new Date()) {
    throw new ManagedGatewayAuthError("Managed gateway key has expired.");
  }

  const decryptedSecret = decryptSecret(keyRecord.encryptedSecret);
  const expectedBuffer = Buffer.from(decryptedSecret);
  const actualBuffer = Buffer.from(parsed.secret);

  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new ManagedGatewayAuthError("Managed gateway key is invalid.");
  }

  return {
    userId: keyRecord.user.id,
    orgId: keyRecord.user.organizationId,
    role: keyRecord.user.role,
    authMode: "managed_gateway",
    teamId: keyRecord.user.teamId,
    email: keyRecord.user.email,
    name: keyRecord.user.fullName,
    gatewayKeyId: keyRecord.id,
    managedClientType: keyRecord.clientType
  };
}

export async function getManagedGatewayKeyForUser(
  app: FastifyInstance,
  input: {
    orgId: string;
    userId: string;
    clientType: ManagedClientType;
    includeSecret?: boolean;
  }
) {
  if (!app.prisma) {
    throw new Error("PostgreSQL is unavailable.");
  }

  const keyRecord = await app.prisma.managedGatewayKey.findFirst({
    where: {
      orgId: input.orgId,
      userId: input.userId,
      clientType: input.clientType,
      status: ManagedGatewayKeyStatus.ACTIVE
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (!keyRecord) {
    return null;
  }

  return {
    key: serializeManagedGatewayKey(keyRecord),
    secret: input.includeSecret ? formatManagedGatewayKey(keyRecord.id, decryptSecret(keyRecord.encryptedSecret)) : null
  };
}

export function serializeManagedGatewayKey(key: {
  id: string;
  name: string;
  clientType: ManagedClientType;
  status: ManagedGatewayKeyStatus;
  secretPreview: string;
  issuedBy?: string | null;
  expiresAt?: Date | null;
  lastUsedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ManagedGatewayKeySummary {
  return {
    id: key.id,
    name: key.name,
    clientType: key.clientType,
    status: key.status,
    secretPreview: key.secretPreview,
    issuedBy: key.issuedBy ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
    updatedAt: key.updatedAt.toISOString()
  };
}

export function formatManagedGatewayKey(keyId: string, secret: string) {
  return `${MANAGED_KEY_PREFIX}.${keyId}.${secret}`;
}

export function formatManagedGatewayPreview(summary: Pick<ManagedGatewayKeySummary, "secretPreview">) {
  return `...${summary.secretPreview}`;
}

function createManagedGatewaySecret() {
  return randomBytes(24).toString("base64url");
}

function parseManagedGatewayKey(value: string) {
  const [prefix, keyId, secret] = value.trim().split(".");
  if (prefix !== MANAGED_KEY_PREFIX || !keyId || !secret) {
    return null;
  }

  return { keyId, secret };
}

function encryptSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

function decryptSecret(payload: string) {
  const [ivText, tagText, encryptedText] = payload.split(".");
  if (!ivText || !tagText || !encryptedText) {
    throw new ManagedGatewayAuthError("Managed gateway key could not be decrypted.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivText, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}

function getEncryptionKey() {
  return createHash("sha256")
    .update(getEnvConfig().MANAGED_GATEWAY_ENCRYPTION_SECRET)
    .digest();
}
