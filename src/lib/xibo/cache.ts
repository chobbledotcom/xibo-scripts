/**
 * libsql-backed API response cache with TTL
 *
 * On Bunny Edge each request is a fresh isolate, so in-memory caches
 * are useless.  We persist cached responses in a `cache` table and
 * expire rows by comparing `expires` (epoch ms) to the current time.
 */

import { getDb } from "#lib/db/client.ts";
import { nowMs } from "#lib/now.ts";

/** Default TTL: 10 minutes — mutations auto-invalidate, so this is safe */
export const DEFAULT_CACHE_TTL_MS = 600_000;

/**
 * Read a cached value.  Returns `null` on miss or expiry.
 */
export const cacheGet = async (key: string): Promise<string | null> => {
  const result = await getDb().execute({
    sql: "SELECT value, expires FROM cache WHERE key = ?",
    args: [key],
  });
  const row = result.rows[0];
  if (!row) return null;

  const expires = row.expires as number;
  if (nowMs() >= expires) {
    // Expired – delete lazily and return miss
    await getDb().execute({
      sql: "DELETE FROM cache WHERE key = ?",
      args: [key],
    });
    return null;
  }

  return row.value as string;
};

/**
 * Write a value into the cache with a TTL (default 10 min).
 */
export const cacheSet = async (
  key: string,
  value: string,
  ttlMs = DEFAULT_CACHE_TTL_MS,
): Promise<void> => {
  const expires = nowMs() + ttlMs;
  await getDb().execute({
    sql: "INSERT OR REPLACE INTO cache (key, value, expires) VALUES (?, ?, ?)",
    args: [key, value, expires],
  });
};

/**
 * Invalidate a single cache key.
 */
export const cacheDelete = async (key: string): Promise<void> => {
  await getDb().execute({
    sql: "DELETE FROM cache WHERE key = ?",
    args: [key],
  });
};

/**
 * Invalidate all cache entries whose key starts with `prefix`.
 * Useful for clearing an entire entity family after mutations:
 *   `cacheInvalidatePrefix("layout")` clears all layout caches.
 */
export const cacheInvalidatePrefix = async (prefix: string): Promise<void> => {
  await getDb().execute({
    sql: "DELETE FROM cache WHERE key LIKE ?",
    args: [`${prefix}%`],
  });
};

/**
 * Drop every cached row.
 */
export const cacheInvalidateAll = async (): Promise<void> => {
  await getDb().execute("DELETE FROM cache");
};

/**
 * Remove expired rows.  Can be called periodically or on a schedule
 * to keep the table compact.
 */
export const cachePurgeExpired = async (): Promise<number> => {
  const result = await getDb().execute({
    sql: "DELETE FROM cache WHERE expires < ?",
    args: [nowMs()],
  });
  return result.rowsAffected;
};
