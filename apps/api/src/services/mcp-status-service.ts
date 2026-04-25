import fs from "node:fs";
import path from "node:path";

const statusFilePath = path.resolve(process.cwd(), "tmp-mcp-status.json");

export function writeMcpHeartbeat() {
  const payload = {
    pid: process.pid,
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync(statusFilePath, JSON.stringify(payload), "utf8");
}

export function clearMcpHeartbeat() {
  if (fs.existsSync(statusFilePath)) {
    fs.unlinkSync(statusFilePath);
  }
}

export function readMcpHeartbeat() {
  if (!fs.existsSync(statusFilePath)) {
    return { triggered: false, status: "idle" as const };
  }

  try {
    const payload = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as { updatedAt?: string; pid?: number };
    const updatedAt = payload.updatedAt ? new Date(payload.updatedAt) : null;
    const ageMs = updatedAt ? Date.now() - updatedAt.getTime() : Number.POSITIVE_INFINITY;
    const triggered = ageMs < 20_000;

    return {
      triggered,
      status: triggered ? ("running" as const) : ("stale" as const),
      pid: payload.pid,
      updatedAt: payload.updatedAt
    };
  } catch {
    return { triggered: false, status: "error" as const };
  }
}
