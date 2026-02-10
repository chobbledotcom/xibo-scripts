/**
 * Activity log table operations
 */

import { getDb } from "#lib/db/client.ts";
import { nowIso } from "#lib/now.ts";

interface ActivityLogEntry {
  id: number;
  created: string;
  message: string;
}

/**
 * Log an activity entry
 */
export const logActivity = async (message: string): Promise<void> => {
  await getDb().execute({
    sql: "INSERT INTO activity_log (created, message) VALUES (?, ?)",
    args: [nowIso(), message],
  });
};

/**
 * Get all activity log entries (most recent first)
 */
export const getAllActivityLog = async (
  limit = 100,
): Promise<ActivityLogEntry[]> => {
  const result = await getDb().execute({
    sql:
      "SELECT id, created, message FROM activity_log ORDER BY id DESC LIMIT ?",
    args: [limit],
  });
  return result.rows as unknown as ActivityLogEntry[];
};
