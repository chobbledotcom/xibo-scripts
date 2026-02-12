/**
 * Health check endpoint with observability data
 *
 * Returns basic health status including database connectivity.
 * Used by monitoring systems to detect service degradation.
 */

import { getDb } from "#lib/db/client.ts";
import { createRequestTimer } from "#lib/logger.ts";

/** Health check result */
export type HealthStatus = {
  status: "ok" | "degraded";
  db: "connected" | "error";
  dbLatencyMs: number;
};

/**
 * Check database connectivity and measure latency.
 */
const checkDb = async (): Promise<{ ok: boolean; latencyMs: number }> => {
  const timer = createRequestTimer();
  try {
    await getDb().execute("SELECT 1");
    return { ok: true, latencyMs: timer() };
  } catch {
    return { ok: false, latencyMs: timer() };
  }
};

/**
 * Health check handler — returns JSON with service status.
 * GET /health
 */
export const handleHealthCheck = async (): Promise<Response> => {
  const db = await checkDb();

  const health: HealthStatus = {
    status: db.ok ? "ok" : "degraded",
    db: db.ok ? "connected" : "error",
    dbLatencyMs: db.latencyMs,
  };

  return new Response(JSON.stringify(health), {
    status: health.status === "ok" ? 200 : 503,
    headers: { "content-type": "application/json" },
  });
};
