import { exec } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function getSchemaPath() {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), "../../../../prisma/schema.prisma");
}

export async function bootstrapApplicationSchema() {
  process.env.DIRECT_URL ??= process.env.DATABASE_URL;
  await runPrismaCommand(["migrate", "deploy", "--schema", getSchemaPath()]);
}

async function runPrismaCommand(args: string[]) {
  const command = `npm exec -- prisma ${args.map(escapeShellArg).join(" ")}`;

  await new Promise<void>((resolve, reject) => {
    const child = exec(command, { cwd: process.cwd() }, (error) => {
      if (error) {
        reject(new Error(`Failed to run ${command}: ${error.message}`));
        return;
      }
      resolve();
    });

    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
  });
}

function escapeShellArg(arg: string): string {
  if (process.platform === "win32") {
    return `"${arg.replace(/"/g, '\\"')}"`;
  }

  return `'${arg.replace(/'/g, `'\\''`)}'`;
}
