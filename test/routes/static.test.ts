import { afterEach, beforeEach, describe, expect, test } from "#test-compat";
import { createTestDbWithSetup, mockRequest, resetDb } from "#test-utils";

describe("static routes", () => {
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

  describe("GET /health", () => {
    test("returns 200 with body OK", async () => {
      const response = await handleRequest(mockRequest("/health"));
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("OK");
    });

    test("returns content-type text/plain", async () => {
      const response = await handleRequest(mockRequest("/health"));
      expect(response.headers.get("content-type")).toBe("text/plain");
    });
  });

  describe("GET /favicon.ico", () => {
    test("returns 200 with content-type image/svg+xml", async () => {
      const response = await handleRequest(mockRequest("/favicon.ico"));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/svg+xml");
    });

    test("returns cache-control immutable header", async () => {
      const response = await handleRequest(mockRequest("/favicon.ico"));
      const cacheControl = response.headers.get("cache-control") || "";
      expect(cacheControl).toContain("immutable");
    });
  });

  describe("GET /mvp.css", () => {
    test("returns 200 with content-type text/css and non-empty body", async () => {
      const response = await handleRequest(mockRequest("/mvp.css"));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/css");
      const body = await response.text();
      expect(body.length).toBeGreaterThan(0);
    });
  });

  describe("GET /admin.js", () => {
    test("returns 200 with content-type application/javascript and non-empty body", async () => {
      const response = await handleRequest(mockRequest("/admin.js"));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "application/javascript",
      );
      const body = await response.text();
      expect(body.length).toBeGreaterThan(0);
    });
  });
});
