import { describe, expect, it } from "#test-compat";
import {
  DEFAULT_RETRY_DELAYS,
  isRetryableError,
  isRetryableStatus,
  RETRYABLE_STATUSES,
  withRetry,
} from "#xibo/retry.ts";
import { XiboClientError } from "#xibo/client.ts";

/** Very short delays to avoid slow tests */
const FAST_DELAYS = [1, 1, 1] as const;

describe("retry", () => {
  describe("DEFAULT_RETRY_DELAYS", () => {
    it("has three values with exponential backoff", () => {
      expect(DEFAULT_RETRY_DELAYS.length).toBe(3);
      expect(DEFAULT_RETRY_DELAYS[0]).toBe(100);
      expect(DEFAULT_RETRY_DELAYS[1]).toBe(200);
      expect(DEFAULT_RETRY_DELAYS[2]).toBe(400);
    });
  });

  describe("RETRYABLE_STATUSES", () => {
    it("contains the expected status codes", () => {
      expect(RETRYABLE_STATUSES.has(408)).toBe(true);
      expect(RETRYABLE_STATUSES.has(429)).toBe(true);
      expect(RETRYABLE_STATUSES.has(500)).toBe(true);
      expect(RETRYABLE_STATUSES.has(502)).toBe(true);
      expect(RETRYABLE_STATUSES.has(503)).toBe(true);
      expect(RETRYABLE_STATUSES.has(504)).toBe(true);
    });
  });

  describe("isRetryableStatus", () => {
    it("returns true for 408 Request Timeout", () => {
      expect(isRetryableStatus(408)).toBe(true);
    });

    it("returns true for 429 Too Many Requests", () => {
      expect(isRetryableStatus(429)).toBe(true);
    });

    it("returns true for 500 Internal Server Error", () => {
      expect(isRetryableStatus(500)).toBe(true);
    });

    it("returns true for 502 Bad Gateway", () => {
      expect(isRetryableStatus(502)).toBe(true);
    });

    it("returns true for 503 Service Unavailable", () => {
      expect(isRetryableStatus(503)).toBe(true);
    });

    it("returns true for 504 Gateway Timeout", () => {
      expect(isRetryableStatus(504)).toBe(true);
    });

    it("returns false for 200 OK", () => {
      expect(isRetryableStatus(200)).toBe(false);
    });

    it("returns false for 400 Bad Request", () => {
      expect(isRetryableStatus(400)).toBe(false);
    });

    it("returns false for 401 Unauthorized", () => {
      expect(isRetryableStatus(401)).toBe(false);
    });

    it("returns false for 403 Forbidden", () => {
      expect(isRetryableStatus(403)).toBe(false);
    });

    it("returns false for 404 Not Found", () => {
      expect(isRetryableStatus(404)).toBe(false);
    });
  });

  describe("isRetryableError", () => {
    it("returns true for XiboClientError with retryable httpStatus", () => {
      const error = new XiboClientError("Server error", 500);
      expect(isRetryableError(error)).toBe(true);
    });

    it("returns true for XiboClientError with status 0 (network error)", () => {
      const error = new XiboClientError("Network failed", 0);
      expect(isRetryableError(error)).toBe(true);
    });

    it("returns false for XiboClientError with non-retryable status", () => {
      const error = new XiboClientError("Not found", 404);
      expect(isRetryableError(error)).toBe(false);
    });

    it("returns false for generic Error without httpStatus", () => {
      const error = new Error("generic error");
      expect(isRetryableError(error)).toBe(false);
    });

    it("returns false for non-Error values", () => {
      expect(isRetryableError("string error")).toBe(false);
      expect(isRetryableError(null)).toBe(false);
      expect(isRetryableError(undefined)).toBe(false);
    });
  });

  describe("withRetry", () => {
    it("returns result on first success without retrying", async () => {
      let callCount = 0;
      const result = await withRetry(() => {
        callCount++;
        return Promise.resolve("ok");
      }, FAST_DELAYS);

      expect(result).toBe("ok");
      expect(callCount).toBe(1);
    });

    it("retries on retryable error then succeeds", async () => {
      let callCount = 0;
      const result = await withRetry(() => {
        callCount++;
        if (callCount < 3) {
          throw new XiboClientError("Service unavailable", 503);
        }
        return Promise.resolve("recovered");
      }, FAST_DELAYS);

      expect(result).toBe("recovered");
      expect(callCount).toBe(3);
    });

    it("exhausts all retries and throws the last error", async () => {
      let callCount = 0;
      try {
        await withRetry(() => {
          callCount++;
          throw new XiboClientError("Always fails", 500);
        }, FAST_DELAYS);
        expect(true).toBe(false); // Should not reach here
      } catch (e) {
        expect((e as Error).message).toBe("Always fails");
        // 1 initial + 3 retries = 4 total calls
        expect(callCount).toBe(4);
      }
    });

    it("throws immediately on non-retryable error without retrying", async () => {
      let callCount = 0;
      try {
        await withRetry(() => {
          callCount++;
          throw new XiboClientError("Forbidden", 403);
        }, FAST_DELAYS);
        expect(true).toBe(false);
      } catch (e) {
        expect((e as Error).message).toBe("Forbidden");
        expect(callCount).toBe(1);
      }
    });

    it("throws immediately on non-Error-based failures", async () => {
      let callCount = 0;
      try {
        await withRetry(() => {
          callCount++;
          throw new Error("Generic error");
        }, FAST_DELAYS);
        expect(true).toBe(false);
      } catch (e) {
        expect((e as Error).message).toBe("Generic error");
        expect(callCount).toBe(1);
      }
    });

    it("stops retrying when a non-retryable error occurs mid-retry", async () => {
      let callCount = 0;
      try {
        await withRetry(() => {
          callCount++;
          if (callCount === 1) {
            throw new XiboClientError("Temporary", 503);
          }
          throw new XiboClientError("Permanent", 401);
        }, FAST_DELAYS);
        expect(true).toBe(false);
      } catch (e) {
        expect((e as Error).message).toBe("Permanent");
        expect(callCount).toBe(2);
      }
    });

    it("works with empty delays array (no retries)", async () => {
      let callCount = 0;
      try {
        await withRetry(() => {
          callCount++;
          throw new XiboClientError("Fail", 500);
        }, []);
        expect(true).toBe(false);
      } catch (e) {
        expect((e as Error).message).toBe("Fail");
        expect(callCount).toBe(1);
      }
    });
  });
});
