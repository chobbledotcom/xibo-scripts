import {
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from "#test-compat";
import {
  createRequestTimer,
  ErrorCode,
  logDebug,
  logError,
  logRequest,
  redactPath,
} from "#lib/logger.ts";

describe("logger", () => {
  describe("redactPath", () => {
    test("redacts numeric IDs in admin paths", () => {
      expect(redactPath("/admin/menuboards/123")).toBe(
        "/admin/menuboards/[id]",
      );
    });

    test("redacts multiple numeric IDs", () => {
      expect(redactPath("/admin/menuboards/123/categories/456")).toBe(
        "/admin/menuboards/[id]/categories/[id]",
      );
    });

    test("preserves paths without dynamic segments", () => {
      expect(redactPath("/admin")).toBe("/admin");
      expect(redactPath("/admin/settings")).toBe("/admin/settings");
      expect(redactPath("/setup")).toBe("/setup");
      expect(redactPath("/")).toBe("/");
    });

    test("handles trailing slashes with IDs", () => {
      expect(redactPath("/admin/media/123/")).toBe("/admin/media/[id]/");
    });
  });

  describe("logRequest", () => {
    let debugSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      debugSpy = spyOn(console, "debug");
    });

    afterEach(() => {
      debugSpy.mockRestore();
    });

    test("logs request with redacted path", () => {
      logRequest({
        method: "GET",
        path: "/admin/menuboards/42",
        status: 200,
        durationMs: 42,
      });

      expect(debugSpy).toHaveBeenCalledWith(
        "[Request] GET /admin/menuboards/[id] 200 42ms",
      );
    });

    test("logs POST request", () => {
      logRequest({
        method: "POST",
        path: "/admin/media/123",
        status: 201,
        durationMs: 100,
      });

      expect(debugSpy).toHaveBeenCalledWith(
        "[Request] POST /admin/media/[id] 201 100ms",
      );
    });

    test("logs error status codes", () => {
      logRequest({
        method: "GET",
        path: "/admin",
        status: 403,
        durationMs: 5,
      });

      expect(debugSpy).toHaveBeenCalledWith("[Request] GET /admin 403 5ms");
    });
  });

  describe("logError", () => {
    let errorSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      errorSpy = spyOn(console, "error");
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    test("logs error code only", () => {
      logError({ code: ErrorCode.DB_CONNECTION });

      expect(errorSpy).toHaveBeenCalledWith("[Error] E_DB_CONNECTION");
    });

    test("logs error with detail", () => {
      logError({ code: ErrorCode.XIBO_API_CONNECTION, detail: "timeout" });

      expect(errorSpy).toHaveBeenCalledWith(
        '[Error] E_XIBO_API_CONNECTION detail="timeout"',
      );
    });
  });

  describe("logDebug", () => {
    let debugSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      debugSpy = spyOn(console, "debug");
    });

    afterEach(() => {
      debugSpy.mockRestore();
    });

    test("logs with Setup category", () => {
      logDebug("Setup", "Validation passed");

      expect(debugSpy).toHaveBeenCalledWith("[Setup] Validation passed");
    });

    test("logs with Auth category", () => {
      logDebug("Auth", "Session created");

      expect(debugSpy).toHaveBeenCalledWith("[Auth] Session created");
    });

    test("logs with Xibo category", () => {
      logDebug("Xibo", "Fetching menu boards");

      expect(debugSpy).toHaveBeenCalledWith("[Xibo] Fetching menu boards");
    });
  });

  describe("createRequestTimer", () => {
    test("returns elapsed time in milliseconds", async () => {
      const getElapsed = createRequestTimer();

      // Wait a small amount
      await new Promise((resolve) => setTimeout(resolve, 10));

      const elapsed = getElapsed();
      expect(elapsed).toBeGreaterThanOrEqual(10);
      expect(elapsed).toBeLessThan(100); // Sanity check
    });

    test("returns integer values", () => {
      const getElapsed = createRequestTimer();
      const elapsed = getElapsed();

      expect(Number.isInteger(elapsed)).toBe(true);
    });
  });

  describe("ErrorCode constants", () => {
    test("has expected error codes", () => {
      expect(ErrorCode.DB_CONNECTION).toBe("E_DB_CONNECTION");
      expect(ErrorCode.DECRYPT_FAILED).toBe("E_DECRYPT_FAILED");
      expect(ErrorCode.AUTH_CSRF_MISMATCH).toBe("E_AUTH_CSRF_MISMATCH");
      expect(ErrorCode.XIBO_API_CONNECTION).toBe("E_XIBO_API_CONNECTION");
      expect(ErrorCode.XIBO_API_AUTH).toBe("E_XIBO_API_AUTH");
      expect(ErrorCode.XIBO_API_REQUEST).toBe("E_XIBO_API_REQUEST");
    });
  });
});
