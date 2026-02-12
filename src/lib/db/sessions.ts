/**
 * Sessions table operations
 */

import { hashSessionToken } from "#lib/crypto.ts";
import { executeByField, getDb, queryAll, queryOne } from "#lib/db/client.ts";

import type { Session } from "#lib/types.ts";

/**
 * Session cache with TTL (10 seconds)
 * Reduces DB queries for repeated session lookups within the TTL window.
 * Cache entries: { session, cachedAt }
 */
const SESSION_CACHE_TTL_MS = 10_000;
type CacheEntry = { session: Session | null; cachedAt: number };
const sessionCache = new Map<string, CacheEntry>();

/**
 * Get cached session if still valid
 */
const getCachedSession = (token: string): Session | null | undefined => {
  const entry = sessionCache.get(token);
  if (!entry) return undefined;

  if (Date.now() - entry.cachedAt > SESSION_CACHE_TTL_MS) {
    sessionCache.delete(token);
    return undefined;
  }

  return entry.session;
};

/**
 * Cache a session lookup result
 */
const cacheSession = (token: string, session: Session | null): void => {
  sessionCache.set(token, { session, cachedAt: Date.now() });
};

/**
 * Listener for external caches to stay in sync with session cache invalidation.
 * Called when any session cache entry is invalidated or the cache is cleared.
 */
type SessionCacheListener = () => void;
let cacheListener: SessionCacheListener | null = null;

/**
 * Register a listener that fires when the session cache is invalidated.
 * Used by higher-level caches (e.g., auth session cache) to stay in sync.
 */
export const onSessionCacheInvalidation = (
  listener: SessionCacheListener | null,
): void => {
  cacheListener = listener;
};

/**
 * Invalidate a session from cache
 */
const invalidateSessionCache = (token: string): void => {
  sessionCache.delete(token);
  cacheListener?.();
};

/**
 * Clear entire session cache
 */
const clearSessionCache = (): void => {
  sessionCache.clear();
  cacheListener?.();
};

/**
 * Clear session cache (exported for testing)
 */
export const resetSessionCache = (): void => {
  clearSessionCache();
};

/**
 * Create a new session with CSRF token and user ID
 * Token is hashed before storage for security
 */
export const createSession = async (
  token: string,
  csrfToken: string,
  expires: number,
  _unused: null,
  userId: number,
): Promise<void> => {
  const tokenHash = await hashSessionToken(token);
  await getDb().execute({
    sql:
      "INSERT INTO sessions (token, csrf_token, expires, user_id) VALUES (?, ?, ?, ?)",
    args: [tokenHash, csrfToken, expires, userId],
  });
  // Pre-cache the new session using token hash as key
  cacheSession(tokenHash, {
    token: tokenHash,
    csrf_token: csrfToken,
    expires,
    user_id: userId,
  });
};

/**
 * Get a session by token (with 10s TTL cache)
 * Token is hashed for database lookup
 */
export const getSession = async (token: string): Promise<Session | null> => {
  const tokenHash = await hashSessionToken(token);

  // Check cache first (using hash as key)
  const cached = getCachedSession(tokenHash);
  if (cached !== undefined) return cached;

  // Query DB and cache result (token column contains the hash)
  const session = await queryOne<Session>(
    "SELECT token, csrf_token, expires, user_id FROM sessions WHERE token = ?",
    [tokenHash],
  );
  cacheSession(tokenHash, session);
  return session;
};

/**
 * Delete a session by token
 * Token is hashed before database lookup
 */
export const deleteSession = async (token: string): Promise<void> => {
  const tokenHash = await hashSessionToken(token);
  invalidateSessionCache(tokenHash);
  await executeByField("sessions", "token", tokenHash);
};

/**
 * Delete all sessions (used when password is changed)
 */
export const deleteAllSessions = async (): Promise<void> => {
  clearSessionCache();
  await getDb().execute("DELETE FROM sessions");
};

/**
 * Get all sessions ordered by expiration (newest first)
 */
export const getAllSessions = (): Promise<Session[]> =>
  queryAll<Session>(
    "SELECT token, csrf_token, expires, user_id FROM sessions ORDER BY expires DESC",
  );

/**
 * Delete all sessions except the current one
 * Token is hashed before database comparison
 */
export const deleteOtherSessions = async (
  currentToken: string,
): Promise<void> => {
  const tokenHash = await hashSessionToken(currentToken);

  // Clear cache except for current token hash
  const currentEntry = sessionCache.get(tokenHash);
  clearSessionCache();
  if (currentEntry) {
    sessionCache.set(tokenHash, currentEntry);
  }

  await getDb().execute({
    sql: "DELETE FROM sessions WHERE token != ?",
    args: [tokenHash],
  });
};
