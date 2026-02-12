/**
 * Retry with exponential backoff for transient Xibo API failures
 *
 * Retries on network errors and transient HTTP status codes
 * with configurable delays and maximum attempts.
 */

import { logDebug } from "#lib/logger.ts";

/** Default retry delays in milliseconds (exponential backoff) */
export const DEFAULT_RETRY_DELAYS = [100, 200, 400] as const;

/** HTTP status codes that indicate a transient failure worth retrying */
export const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/** Check if an HTTP status code is retryable */
export const isRetryableStatus = (status: number): boolean =>
  RETRYABLE_STATUSES.has(status);

/** Check if an error represents a retryable failure (network error = status 0) */
export const isRetryableError = (error: unknown): boolean => {
  if (error instanceof Error && "httpStatus" in error) {
    const status = (error as { httpStatus: number }).httpStatus;
    return status === 0 || isRetryableStatus(status);
  }
  return false;
};

/**
 * Execute a function with retry and exponential backoff.
 *
 * Retries the function when isRetryable returns true for the thrown error.
 * Waits for increasing delays between attempts.
 *
 * @param fn - The async function to execute
 * @param delays - Array of delay times in ms (length = max retries)
 * @returns The result of fn on success
 * @throws The last error if all retries are exhausted
 */
export const withRetry = async <T>(
  fn: () => Promise<T>,
  delays: readonly number[] = DEFAULT_RETRY_DELAYS,
): Promise<T> => {
  let lastError: unknown;

  // First attempt (no delay)
  try {
    return await fn();
  } catch (e) {
    if (!isRetryableError(e) || delays.length === 0) throw e;
    lastError = e;
  }

  // Retry attempts with backoff
  for (const delay of delays) {
    logDebug("Xibo", `retrying after ${delay}ms`);
    await new Promise<void>((r) => setTimeout(r, delay));
    try {
      return await fn();
    } catch (e) {
      if (!isRetryableError(e)) throw e;
      lastError = e;
    }
  }

  throw lastError;
};
