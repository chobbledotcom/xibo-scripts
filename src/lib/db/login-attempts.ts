/**
 * Login attempts table operations - rate limiting
 */

import { getDb, queryOne } from "#lib/db/client.ts";
import { nowMs } from "#lib/now.ts";

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface LoginAttempt {
  ip: string;
  attempts: number;
  locked_until: number | null;
}

/**
 * Check if a client IP is rate limited
 */
export const isLoginRateLimited = async (ip: string): Promise<boolean> => {
  const attempt = await queryOne<LoginAttempt>(
    "SELECT ip, attempts, locked_until FROM login_attempts WHERE ip = ?",
    [ip],
  );

  if (!attempt) return false;

  // Check if locked and still within lockout period
  if (attempt.locked_until && attempt.locked_until > nowMs()) {
    return true;
  }

  // If lockout has expired, reset
  if (attempt.locked_until && attempt.locked_until <= nowMs()) {
    await clearLoginAttempts(ip);
    return false;
  }

  return false;
};

/**
 * Record a failed login attempt
 */
export const recordFailedLogin = async (ip: string): Promise<void> => {
  const attempt = await queryOne<LoginAttempt>(
    "SELECT ip, attempts, locked_until FROM login_attempts WHERE ip = ?",
    [ip],
  );

  if (!attempt) {
    await getDb().execute({
      sql: "INSERT INTO login_attempts (ip, attempts, locked_until) VALUES (?, 1, NULL)",
      args: [ip],
    });
    return;
  }

  const newAttempts = attempt.attempts + 1;
  const lockedUntil = newAttempts >= MAX_ATTEMPTS ? nowMs() + LOCKOUT_DURATION_MS : null;

  await getDb().execute({
    sql: "UPDATE login_attempts SET attempts = ?, locked_until = ? WHERE ip = ?",
    args: [newAttempts, lockedUntil, ip],
  });
};

/**
 * Clear login attempts for an IP (after successful login)
 */
export const clearLoginAttempts = async (ip: string): Promise<void> => {
  await getDb().execute({
    sql: "DELETE FROM login_attempts WHERE ip = ?",
    args: [ip],
  });
};
