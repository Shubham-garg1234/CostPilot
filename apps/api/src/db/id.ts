import { randomBytes } from "node:crypto";

/** Cuid-style id for new rows. */
export function createId(): string {
  const time = Date.now().toString(36);
  const random = randomBytes(6).toString("hex");
  return `c${time}${random}`;
}
