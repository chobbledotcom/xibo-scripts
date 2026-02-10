import { afterEach, beforeEach, describe, expect, test } from "#test-compat";
import {
  createTestDbWithSetup,
  mockRequest,
  mockRequestWithHost,
  resetDb,
} from "#test-utils";
import { mockFormRequest } from "#test-utils";
import { isValidContentType } from "#routes/middleware.ts";

describe("security middleware", () => {
  beforeEach(async () => {
    await createTestDbWithSetup();
  });

  afterEach(() => {
    resetDb();
  });

  const handleRequest = async (request: Request): Promise<Response> => {
    const { handleRequest: handler } = await import("#routes");
    return handler(request);
  };

  describe("domain validation", () => {
    test("rejects request with no Host header", async () => {
      const request = new Request("http://localhost/health", {
        headers: {},
      });
      const response = await handleRequest(request);
      expect(response.status).toBe(403);
    });

    test("rejects request with wrong Host", async () => {
      const response = await handleRequest(
        mockRequestWithHost("/health", "evil.example.com"),
      );
      expect(response.status).toBe(403);
    });

    test("accepts request with correct Host", async () => {
      const response = await handleRequest(mockRequest("/health"));
      expect(response.status).toBe(200);
    });
  });

  describe("content-type validation", () => {
    test("rejects POST with no Content-Type", async () => {
      const request = new Request("http://localhost/admin/login", {
        method: "POST",
        headers: { host: "localhost" },
        body: "username=test&password=test",
      });
      const response = await handleRequest(request);
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("Invalid Content-Type");
    });

    test("rejects POST with application/json", async () => {
      const request = new Request("http://localhost/admin/login", {
        method: "POST",
        headers: {
          host: "localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({ username: "test" }),
      });
      const response = await handleRequest(request);
      expect(response.status).toBe(400);
    });

    test("accepts POST with application/x-www-form-urlencoded", async () => {
      const response = await handleRequest(
        mockFormRequest("/admin/login", {
          username: "test",
          password: "test",
        }),
      );
      // Should not be 400 content-type error (will be 401 or other)
      expect(response.status).not.toBe(400);
    });

    test("accepts POST with multipart/form-data content-type", () => {
      const request = new Request("http://localhost/admin/login", {
        method: "POST",
        headers: {
          host: "localhost",
          "content-type": "multipart/form-data; boundary=----test",
        },
        body: "------test--\r\n",
      });
      expect(isValidContentType(request)).toBe(true);
    });

    test("allows GET requests without Content-Type", async () => {
      const response = await handleRequest(mockRequest("/health"));
      expect(response.status).toBe(200);
    });
  });

  describe("security headers", () => {
    test("every response includes x-content-type-options: nosniff", async () => {
      const response = await handleRequest(mockRequest("/health"));
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    });

    test("every response includes x-frame-options: DENY", async () => {
      const response = await handleRequest(mockRequest("/health"));
      expect(response.headers.get("x-frame-options")).toBe("DENY");
    });

    test("every response includes content-security-policy", async () => {
      const response = await handleRequest(mockRequest("/health"));
      const csp = response.headers.get("content-security-policy") || "";
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("default-src 'self'");
    });

    test("every response includes referrer-policy", async () => {
      const response = await handleRequest(mockRequest("/health"));
      expect(response.headers.get("referrer-policy")).toBe(
        "strict-origin-when-cross-origin",
      );
    });

    test("every response includes x-robots-tag", async () => {
      const response = await handleRequest(mockRequest("/health"));
      expect(response.headers.get("x-robots-tag")).toContain("noindex");
    });
  });

  describe("hostname extraction", () => {
    test("strips port from Host header", async () => {
      const response = await handleRequest(
        mockRequestWithHost("/health", "localhost:3000"),
      );
      expect(response.status).toBe(200);
    });
  });
});
