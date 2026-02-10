/**
 * Bunny Edge Scripting entry point
 * Deployed to Bunny CDN edge network
 */

import * as BunnySDK from "@bunny.net/edgescript-sdk";
import { memoize } from "#fp";

/**
 * One-time initialization (cold start):
 * - Validate encryption key
 * - Run database migrations
 */
const initialize = memoize(async () => {
  const { validateEncryptionKey } = await import("#lib/crypto.ts");
  validateEncryptionKey();

  const { initDb } = await import("#lib/db/migrations/index.ts");
  await initDb();
});

BunnySDK.net.http.serve(async (request: Request) => {
  try {
    await initialize();
    const { handleRequest } = await import("#routes");
    return handleRequest(request);
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Edge error logging
    console.error("[Edge Error]", error);
    return new Response("Internal Server Error", { status: 500 });
  }
});
