/**
 * Publish attempt tracking
 *
 * Tracks the lifecycle of publish operations (menu screen changes
 * that trigger Xibo layout/campaign/schedule updates).
 * Each attempt records: started → success/failed with duration.
 */

import { getDb, queryAll, queryOne } from "#lib/db/client.ts";
import { nowIso } from "#lib/now.ts";

/** Publish attempt status */
export type PublishStatus = "started" | "success" | "failed";

/** Stored publish attempt row */
export interface PublishAttempt {
  id: number;
  created: string;
  user_id: number;
  business_id: number;
  screen_id: number;
  status: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_detail: string | null;
}

/**
 * Create a new publish attempt in "started" status.
 * Returns the attempt ID for later completion.
 */
export const createPublishAttempt = async (
  userId: number,
  businessId: number,
  screenId: number,
): Promise<number> => {
  const result = await getDb().execute({
    sql: `INSERT INTO publish_attempts (created, user_id, business_id, screen_id, status)
          VALUES (?, ?, ?, ?, 'started')`,
    args: [nowIso(), userId, businessId, screenId],
  });
  return Number(result.lastInsertRowid);
};

/**
 * Complete a publish attempt with a final status and optional error detail.
 */
export const completePublishAttempt = async (
  id: number,
  status: "success" | "failed",
  durationMs: number,
  errorDetail?: string,
): Promise<void> => {
  await getDb().execute({
    sql: `UPDATE publish_attempts
          SET status = ?, completed_at = ?, duration_ms = ?, error_detail = ?
          WHERE id = ?`,
    args: [status, nowIso(), durationMs, errorDetail ?? null, id],
  });
};

/**
 * Get publish attempts for a business, most recent first.
 */
export const getPublishAttempts = (
  businessId: number,
  limit = 50,
): Promise<PublishAttempt[]> =>
  queryAll<PublishAttempt>(
    `SELECT id, created, user_id, business_id, screen_id, status, completed_at, duration_ms, error_detail
     FROM publish_attempts WHERE business_id = ? ORDER BY id DESC LIMIT ?`,
    [businessId, limit],
  );

/**
 * Get publish attempts for a specific screen.
 */
export const getPublishAttemptsForScreen = (
  screenId: number,
  limit = 50,
): Promise<PublishAttempt[]> =>
  queryAll<PublishAttempt>(
    `SELECT id, created, user_id, business_id, screen_id, status, completed_at, duration_ms, error_detail
     FROM publish_attempts WHERE screen_id = ? ORDER BY id DESC LIMIT ?`,
    [screenId, limit],
  );

/**
 * Get a single publish attempt by ID.
 */
export const getPublishAttemptById = (
  id: number,
): Promise<PublishAttempt | null> =>
  queryOne<PublishAttempt>(
    `SELECT id, created, user_id, business_id, screen_id, status, completed_at, duration_ms, error_detail
     FROM publish_attempts WHERE id = ?`,
    [id],
  );

/**
 * Count publish attempts by status for a business (for observability).
 */
export const countPublishAttemptsByStatus = async (
  businessId: number,
): Promise<Record<string, number>> => {
  const rows = await queryAll<{ status: string; count: number }>(
    `SELECT status, COUNT(*) as count FROM publish_attempts WHERE business_id = ? GROUP BY status`,
    [businessId],
  );
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.status] = row.count;
  }
  return result;
};
