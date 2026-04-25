import { spawn } from "node:child_process";

const pnpmCommand = process.platform === "win32" ? "pnpm" : "pnpm";
const children = [];
let shuttingDown = false;

function start(command) {
  const child = spawn(command, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: true
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    for (const other of children) {
      if (other !== child && !other.killed) {
        other.kill("SIGTERM");
      }
    }

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });

  children.push(child);
  return child;
}

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => process.exit(0), 100).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start(`${pnpmCommand} --filter @costpilot/api dev`);
start(`${pnpmCommand} --filter @costpilot/api dev:mcp`);
