import { afterEach, beforeEach, describe, expect, it } from "#test-compat";
import {
  createTestDb,
  createTestDbWithSetup,
  mockRequest,
  resetDb,
} from "#test-utils";

const handle = async (req: Request): Promise<Response> => {
  const { handleRequest } = await import("#routes");
  return handleRequest(req);
};

describe("routing & not found", () => {
  beforeEach(() => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
  });

  afterEach(() => {
    resetDb();
  });

  describe("root redirect", () => {
    it("GET / redirects to /admin when setup complete", async () => {
      await createTestDbWithSetup();
      const res = await handle(mockRequest("/"));
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/admin");
    });
  });

  describe("not found", () => {
    it("GET /nonexistent returns 404", async () => {
      await createTestDbWithSetup();
      const res = await handle(mockRequest("/nonexistent"));
      expect(res.status).toBe(404);
    });

    it("GET /admin/nonexistent returns 404", async () => {
      await createTestDbWithSetup();
      const res = await handle(mockRequest("/admin/nonexistent"));
      expect(res.status).toBe(404);
    });
  });

  describe("trailing slash normalization", () => {
    it("GET /admin/ treated same as GET /admin", async () => {
      await createTestDbWithSetup();
      const res = await handle(mockRequest("/admin/"));
      // Should get the login page or dashboard (200), not a 404
      expect(res.status).toBe(200);
    });
  });

  describe("setup redirect", () => {
    it("GET / redirects to /setup when setup NOT complete", async () => {
      await createTestDb();
      const res = await handle(mockRequest("/"));
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/setup");
    });

    it("GET /admin redirects to /setup when setup NOT complete", async () => {
      await createTestDb();
      const res = await handle(mockRequest("/admin"));
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/setup");
    });
  });

  describe("request logging", () => {
    it("request is handled and returns proper status", async () => {
      // Verify that the full request pipeline (including logging) completes
      await createTestDbWithSetup();
      const res = await handle(mockRequest("/health"));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("OK");
    });
  });
});
