import { afterEach, beforeEach, describe, expect, it, jest } from "#test-compat";
import {
  createCircuitBreaker,
  FAILURE_THRESHOLD,
  getXiboCircuitBreaker,
  RECOVERY_TIMEOUT_MS,
  resetXiboCircuitBreaker,
} from "#xibo/circuit-breaker.ts";

describe("circuit breaker", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
    resetXiboCircuitBreaker();
  });

  afterEach(() => {
    jest.useRealTimers();
    resetXiboCircuitBreaker();
  });

  describe("constants", () => {
    it("has FAILURE_THRESHOLD of 5", () => {
      expect(FAILURE_THRESHOLD).toBe(5);
    });

    it("has RECOVERY_TIMEOUT_MS of 30000", () => {
      expect(RECOVERY_TIMEOUT_MS).toBe(30_000);
    });
  });

  describe("createCircuitBreaker", () => {
    it("starts in closed state", () => {
      const cb = createCircuitBreaker();
      expect(cb.getState()).toBe("closed");
      expect(cb.getFailures()).toBe(0);
    });

    it("stays closed below failure threshold", () => {
      const cb = createCircuitBreaker();
      for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) {
        cb.recordFailure();
      }
      expect(cb.getState()).toBe("closed");
      expect(cb.canAttempt()).toBe(true);
      expect(cb.getFailures()).toBe(FAILURE_THRESHOLD - 1);
    });

    it("opens after reaching failure threshold", () => {
      const cb = createCircuitBreaker();
      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        cb.recordFailure();
      }
      expect(cb.getState()).toBe("open");
      expect(cb.getFailures()).toBe(FAILURE_THRESHOLD);
    });

    it("fails fast when open (canAttempt returns false)", () => {
      const cb = createCircuitBreaker();
      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        cb.recordFailure();
      }
      expect(cb.canAttempt()).toBe(false);
    });

    it("transitions to half-open after recovery timeout", () => {
      const cb = createCircuitBreaker();
      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        cb.recordFailure();
      }
      expect(cb.getState()).toBe("open");

      // Advance time past recovery timeout
      jest.setSystemTime(1_000_000 + RECOVERY_TIMEOUT_MS);
      expect(cb.getState()).toBe("half-open");
      expect(cb.canAttempt()).toBe(true);
    });

    it("closes on success in half-open state", () => {
      const cb = createCircuitBreaker();
      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        cb.recordFailure();
      }
      jest.setSystemTime(1_000_000 + RECOVERY_TIMEOUT_MS);
      expect(cb.getState()).toBe("half-open");

      cb.recordSuccess();
      expect(cb.getState()).toBe("closed");
      expect(cb.getFailures()).toBe(0);
    });

    it("recordSuccess resets failures and closes circuit", () => {
      const cb = createCircuitBreaker();
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getFailures()).toBe(3);

      cb.recordSuccess();
      expect(cb.getFailures()).toBe(0);
      expect(cb.getState()).toBe("closed");
    });

    it("reset returns to closed state with 0 failures", () => {
      const cb = createCircuitBreaker();
      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        cb.recordFailure();
      }
      expect(cb.getState()).toBe("open");

      cb.reset();
      expect(cb.getState()).toBe("closed");
      expect(cb.getFailures()).toBe(0);
      expect(cb.canAttempt()).toBe(true);
    });
  });

  describe("custom config", () => {
    it("respects custom failure threshold", () => {
      const cb = createCircuitBreaker({ failureThreshold: 2 });
      cb.recordFailure();
      expect(cb.getState()).toBe("closed");
      cb.recordFailure();
      expect(cb.getState()).toBe("open");
    });

    it("respects custom recovery timeout", () => {
      const cb = createCircuitBreaker({
        failureThreshold: 1,
        recoveryTimeoutMs: 5000,
      });
      cb.recordFailure();
      expect(cb.getState()).toBe("open");

      // Not enough time
      jest.setSystemTime(1_000_000 + 4999);
      expect(cb.getState()).toBe("open");

      // Enough time
      jest.setSystemTime(1_000_000 + 5000);
      expect(cb.getState()).toBe("half-open");
    });
  });

  describe("singleton", () => {
    it("getXiboCircuitBreaker returns the same instance", () => {
      const a = getXiboCircuitBreaker();
      const b = getXiboCircuitBreaker();
      expect(a).toBe(b);
    });

    it("resetXiboCircuitBreaker clears the singleton", () => {
      const a = getXiboCircuitBreaker();
      resetXiboCircuitBreaker();
      const b = getXiboCircuitBreaker();
      expect(a).not.toBe(b);
    });

    it("singleton starts in closed state", () => {
      const cb = getXiboCircuitBreaker();
      expect(cb.getState()).toBe("closed");
      expect(cb.getFailures()).toBe(0);
    });
  });
});
