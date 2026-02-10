import {
  afterEach,
  describe,
  expect,
  test,
} from "#test-compat";
import {
  createTestDb,
  createTestDbWithSetup,
  mockRequest,
  resetDb,
} from "#test-utils";

describe("routing", () => {
  afterEach(() => {
    resetDb();
  });

  const handleRequest = async (request: Request): Promise<Response> => {
    const { handleRequest: handler } = await import("#routes");
    return handler(request);
  };

  describe("root redirect", () => {
    test("GET / redirects to /admin when setup complete", async () => {
      await createTestDbWithSetup();
      const response = await handleRequest(mockRequest("/"));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });
  });

  describe("not found", () => {
    test("GET /nonexistent returns 404", async () => {
      await createTestDbWithSetup();
      const response = await handleRequest(mockRequest("/nonexistent"));
      expect(response.status).toBe(404);
    });

    test("GET /admin/nonexistent returns 404", async () => {
      await createTestDbWithSetup();
      const response = await handleRequest(mockRequest("/admin/nonexistent"));
      expect(response.status).toBe(404);
    });
  });

  describe("trailing slash normalization", () => {
    test("GET /admin/ treated same as GET /admin", async () => {
      await createTestDbWithSetup();
      const response = await handleRequest(mockRequest("/admin/"));
      expect(response.status).toBe(200);
    });
  });

  describe("setup redirect", () => {
    test("GET / redirects to /setup when setup NOT complete", async () => {
      await createTestDb();
      const response = await handleRequest(mockRequest("/"));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/setup");
    });

    test("GET /admin redirects to /setup when setup NOT complete", async () => {
      await createTestDb();
      const response = await handleRequest(mockRequest("/admin"));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/setup");
    });
  });

  describe("HTTP methods", () => {
    test("DELETE to a GET-only route returns 404", async () => {
      await createTestDbWithSetup();
      const request = new Request("http://localhost/health", {
        method: "DELETE",
        headers: { host: "localhost" },
      });
      const response = await handleRequest(request);
      expect(response.status).toBe(404);
    });
  });
});
