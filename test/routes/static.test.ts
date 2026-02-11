import { beforeEach, describe, expect, it } from "#test-compat";
import { createTestDbWithSetup, mockRequest } from "#test-utils";

const request = async (path: string): Promise<Response> => {
  const { handleRequest } = await import("#routes");
  return handleRequest(mockRequest(path));
};

describe("health & static assets", () => {
  beforeEach(async () => {
    await createTestDbWithSetup();
  });

  describe("GET /health", () => {
    it("returns 200 with body OK", async () => {
      const res = await request("/health");
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("OK");
    });

    it("returns content-type text/plain", async () => {
      const res = await request("/health");
      expect(res.headers.get("content-type")).toBe("text/plain");
    });
  });

  describe("GET /favicon.ico", () => {
    it("returns 200 with content-type image/svg+xml", async () => {
      const res = await request("/favicon.ico");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/svg+xml");
    });

    it("returns cache-control immutable header", async () => {
      const res = await request("/favicon.ico");
      const cc = res.headers.get("cache-control") || "";
      expect(cc).toContain("immutable");
    });
  });

  describe("GET /mvp.css", () => {
    it("returns 200 with content-type text/css and non-empty body", async () => {
      const res = await request("/mvp.css");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/css");
      const body = await res.text();
      expect(body.length).toBeGreaterThan(0);
    });
  });

  describe("GET /admin.js", () => {
    it("returns 200 with content-type application/javascript and non-empty body", async () => {
      const res = await request("/admin.js");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/javascript");
      const body = await res.text();
      expect(body.length).toBeGreaterThan(0);
    });
  });
});
