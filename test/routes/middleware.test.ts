import { beforeEach, describe, expect, it } from "#test-compat";
import {
  createTestDbWithSetup,
  handle,
  mockRequest,
  mockRequestWithHost,
} from "#test-utils";

describe("security middleware", () => {
  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
  });

  describe("domain validation", () => {
    it("rejects request with no Host header", async () => {
      const req = new Request("http://localhost/health", {
        headers: {},
      });
      const res = await handle(req);
      expect(res.status).toBe(403);
    });

    it("rejects request with wrong Host", async () => {
      const res = await handle(mockRequestWithHost("/health", "evil.com"));
      expect(res.status).toBe(403);
    });

    it("accepts request with correct Host", async () => {
      const res = await handle(mockRequest("/health"));
      expect(res.status).toBe(200);
    });
  });

  describe("content-type validation", () => {
    it("rejects POST with no Content-Type", async () => {
      const req = new Request("http://localhost/admin/login", {
        method: "POST",
        headers: { host: "localhost" },
        body: "data",
      });
      const res = await handle(req);
      expect(res.status).toBe(400);
      expect(await res.text()).toContain("Invalid Content-Type");
    });

    it("rejects POST with application/json", async () => {
      const req = new Request("http://localhost/admin/login", {
        method: "POST",
        headers: { host: "localhost", "content-type": "application/json" },
        body: "{}",
      });
      const res = await handle(req);
      expect(res.status).toBe(400);
    });

    it("accepts POST with application/x-www-form-urlencoded", async () => {
      const req = new Request("http://localhost/admin/login", {
        method: "POST",
        headers: {
          host: "localhost",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "username=a&password=b",
      });
      const res = await handle(req);
      // Should get past content-type validation (might be 400/401 from login logic)
      expect(res.status).not.toBe(400);
    });

    it("accepts POST with multipart/form-data past content-type check", async () => {
      const body =
        `------formdata-test-boundary\r\nContent-Disposition: form-data; name="test"\r\n\r\nvalue\r\n------formdata-test-boundary--\r\n`;
      const req = new Request("http://localhost/admin/login", {
        method: "POST",
        headers: {
          host: "localhost",
          "content-type": `multipart/form-data; boundary=----formdata-test-boundary`,
        },
        body,
      });
      const res = await handle(req);
      const text = await res.text();
      // The content-type middleware accepts multipart/form-data — the response
      // should NOT be the "Invalid Content-Type" rejection from the middleware.
      expect(text).not.toContain("Invalid Content-Type");
    });

    it("allows GET requests without Content-Type", async () => {
      const res = await handle(mockRequest("/health"));
      expect(res.status).toBe(200);
    });
  });

  describe("security headers", () => {
    it("every response includes x-content-type-options: nosniff", async () => {
      const res = await handle(mockRequest("/health"));
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    });

    it("every response includes x-frame-options: DENY", async () => {
      const res = await handle(mockRequest("/health"));
      expect(res.headers.get("x-frame-options")).toBe("DENY");
    });

    it("every response includes content-security-policy", async () => {
      const res = await handle(mockRequest("/health"));
      const csp = res.headers.get("content-security-policy") || "";
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("default-src 'self'");
    });

    it("every response includes referrer-policy", async () => {
      const res = await handle(mockRequest("/health"));
      expect(res.headers.get("referrer-policy")).toBe(
        "strict-origin-when-cross-origin",
      );
    });

    it("every response includes x-robots-tag", async () => {
      const res = await handle(mockRequest("/health"));
      expect(res.headers.get("x-robots-tag")).toContain("noindex");
    });
  });

  describe("content-type fallback to empty string", () => {
    it("rejects POST with null content-type (fallback to empty string)", async () => {
      // Explicitly construct a POST request with no content-type header at all
      // to exercise the `|| ""` fallback on middleware.ts line 68
      const headers = new Headers({ host: "localhost" });
      const req = new Request("http://localhost/setup", {
        method: "POST",
        headers,
      });
      // Verify content-type is indeed null before the request
      expect(req.headers.get("content-type")).toBeNull();
      const res = await handle(req);
      expect(res.status).toBe(400);
      expect(await res.text()).toContain("Invalid Content-Type");
    });
  });

  describe("hostname extraction", () => {
    it("strips port from Host header", async () => {
      Deno.env.set("ALLOWED_DOMAIN", "localhost");
      const res = await handle(
        mockRequestWithHost("/health", "localhost:3000"),
      );
      expect(res.status).toBe(200);
    });
  });
});
