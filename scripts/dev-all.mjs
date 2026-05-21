import { spawn } from "node:child_process";

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

function shutdown() {
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

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start("npm run dev:api");
start("npm run dev:web");
