/**
 * Development server entry point
 * Runs locally via: deno task start
 */

import { validateEncryptionKey } from "#lib/crypto.ts";
import { initDb } from "#lib/db/migrations/index.ts";
import { getEnv } from "#lib/env.ts";
import { handleRequest } from "#routes";

// Validate encryption key is present and valid on startup
validateEncryptionKey();

// Initialize database tables
await initDb();

const port = Number(getEnv("PORT") || "3000");
console.log(`Starting server on http://localhost:${port}`);

Deno.serve(
  { port },
  (request: Request, info: Deno.ServeHandlerInfo) =>
    handleRequest(request, {
      requestIP: () => ({
        address: "hostname" in info.remoteAddr
          ? info.remoteAddr.hostname
          : "unknown",
      }),
    }),
);
