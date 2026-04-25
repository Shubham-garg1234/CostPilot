import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { RoleKey } from "@prisma/client";

const TOKEN_PREFIX = "cp_emp";

export type EmployeeTokenPayload = {
  userId: string;
  orgId: string;
  role: RoleKey;
  teamId?: string | null;
  email?: string;
  name?: string;
  exp: number;
};

export function createPasswordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, passwordHash?: string | null) {
  if (!passwordHash) {
    return false;
  }

  const [salt, stored] = passwordHash.split(":");
  if (!salt || !stored) {
    return false;
  }

  const derived = scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(stored, "hex");
  if (derived.length !== storedBuffer.length) {
    return false;
  }

  return timingSafeEqual(derived, storedBuffer);
}

export function generateTemporaryPassword(length = 14) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from(randomBytes(length))
    .map((value) => alphabet[value % alphabet.length])
    .join("");
}

export function createEmployeeAccessToken(payload: Omit<EmployeeTokenPayload, "exp">, secret: string, ttlSeconds = 60 * 60 * 24 * 7) {
  const body: EmployeeTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };

  const encodedPayload = toBase64Url(JSON.stringify(body));
  const signature = sign(encodedPayload, secret);
  return `${TOKEN_PREFIX}.${encodedPayload}.${signature}`;
}

export function verifyEmployeeAccessToken(token: string, secret: string) {
  const [prefix, encodedPayload, signature] = token.split(".");
  if (prefix !== TOKEN_PREFIX || !encodedPayload || !signature) {
    return null;
  }

  const expected = sign(encodedPayload, secret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(encodedPayload)) as EmployeeTokenPayload;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function sign(value: string, secret: string) {
  return toBase64Url(createHmac("sha256", secret).update(value).digest());
}

function toBase64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (input.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}
