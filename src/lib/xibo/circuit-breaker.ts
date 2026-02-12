/**
 * Circuit breaker for Xibo API calls
 *
 * Prevents cascading failures by tracking consecutive errors
 * and short-circuiting requests when the API is down.
 *
 * States:
 * - closed: normal operation, requests pass through
 * - open: API considered down, requests fail fast
 * - half-open: after recovery timeout, allow one probe request
 *
 * In Bunny Edge (production) each request is a fresh isolate,
 * so the breaker state resets per request. In Deno.serve (dev)
 * the state persists across requests, providing real protection.
 */

import { nowMs } from "#lib/now.ts";

/** Circuit breaker states */
export type CircuitState = "closed" | "open" | "half-open";

/** Default failure threshold to open the circuit */
export const FAILURE_THRESHOLD = 5;

/** Default recovery timeout in milliseconds (30 seconds) */
export const RECOVERY_TIMEOUT_MS = 30_000;

/** Circuit breaker configuration */
type CircuitBreakerConfig = {
  failureThreshold: number;
  recoveryTimeoutMs: number;
};

/** Internal mutable circuit state */
type CircuitInternalState = {
  failures: number;
  lastFailureAt: number;
  state: CircuitState;
};

/** Circuit breaker instance */
export type CircuitBreaker = {
  /** Get the current circuit state */
  getState: () => CircuitState;
  /** Get the current failure count */
  getFailures: () => number;
  /** Check if a request is allowed through the circuit */
  canAttempt: () => boolean;
  /** Record a successful request (resets failure count, closes circuit) */
  recordSuccess: () => void;
  /** Record a failed request (increments failures, may open circuit) */
  recordFailure: () => void;
  /** Reset the circuit breaker to initial state */
  reset: () => void;
};

/**
 * Create a circuit breaker instance.
 */
export const createCircuitBreaker = (
  config: Partial<CircuitBreakerConfig> = {},
): CircuitBreaker => {
  const threshold = config.failureThreshold ?? FAILURE_THRESHOLD;
  const timeout = config.recoveryTimeoutMs ?? RECOVERY_TIMEOUT_MS;

  const internal: CircuitInternalState = {
    failures: 0,
    lastFailureAt: 0,
    state: "closed",
  };

  const getState = (): CircuitState => {
    if (internal.state === "open") {
      // Check if recovery timeout has elapsed → transition to half-open
      if (nowMs() - internal.lastFailureAt >= timeout) {
        internal.state = "half-open";
      }
    }
    return internal.state;
  };

  const canAttempt = (): boolean => {
    const state = getState();
    return state === "closed" || state === "half-open";
  };

  const recordSuccess = (): void => {
    internal.failures = 0;
    internal.state = "closed";
  };

  const recordFailure = (): void => {
    internal.failures += 1;
    internal.lastFailureAt = nowMs();
    if (internal.failures >= threshold) {
      internal.state = "open";
    }
  };

  const reset = (): void => {
    internal.failures = 0;
    internal.lastFailureAt = 0;
    internal.state = "closed";
  };

  return {
    getState,
    getFailures: () => internal.failures,
    canAttempt,
    recordSuccess,
    recordFailure,
    reset,
  };
};

/** Singleton circuit breaker for the Xibo API */
let xiboBreaker: CircuitBreaker | null = null;

/**
 * Get or create the singleton Xibo circuit breaker.
 */
export const getXiboCircuitBreaker = (): CircuitBreaker => {
  if (!xiboBreaker) {
    xiboBreaker = createCircuitBreaker();
  }
  return xiboBreaker;
};

/**
 * Reset the singleton circuit breaker (for testing).
 */
export const resetXiboCircuitBreaker = (): void => {
  xiboBreaker = null;
};
