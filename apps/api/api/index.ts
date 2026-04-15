import serverless from "serverless-http";
import { buildApp } from "../src/app";

let cachedHandler: ((req: unknown, res: unknown) => Promise<void>) | null = null;

async function getHandler() {
  if (!cachedHandler) {
    const app = await buildApp();
    await app.ready();
    const proxy = serverless(app as unknown as Parameters<typeof serverless>[0]);

    cachedHandler = async (req: unknown, res: unknown) => {
      await proxy(req, res);
    };
  }

  return cachedHandler;
}

export default async function handler(req: unknown, res: unknown) {
  const proxy = await getHandler();
  await proxy(req, res);
}
