import { afterEach, beforeEach, describe, expect, test } from "#test-compat";
import {
  createTestDbWithSetup,
  loginAsAdmin,
  mockFormRequest,
  mockRequest,
  resetDb,
} from "#test-utils";

describe("admin sessions", () => {
  let cookie: string;
  let csrfToken: string;

  beforeEach(async () => {
    await createTestDbWithSetup();
    const auth = await loginAsAdmin();
    cookie = auth.cookie;
    csrfToken = auth.csrfToken;
  });

  afterEach(() => {
    resetDb();
  });

  const handleRequest = async (request: Request): Promise<Response> => {
    const { handleRequest: handler } = await import("#routes");
    return handler(request);
  };

  describe("GET /admin/sessions (unauthenticated)", () => {
    test("redirects to /admin", async () => {
      const response = await handleRequest(mockRequest("/admin/sessions"));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });
  });

  describe("GET /admin/sessions (owner)", () => {
    test("returns 200 with sessions page", async () => {
      const response = await handleRequest(
        mockRequest("/admin/sessions", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Active Sessions");
    });

    test("shows active session count", async () => {
      const response = await handleRequest(
        mockRequest("/admin/sessions", { headers: { cookie } }),
      );
      const html = await response.text();
      expect(html).toContain("1 active session");
    });

    test("shows Clear Other Sessions button with CSRF token", async () => {
      const response = await handleRequest(
        mockRequest("/admin/sessions", { headers: { cookie } }),
      );
      const html = await response.text();
      expect(html).toContain("Clear Other Sessions");
      expect(html).toContain("csrf_token");
    });
  });

  describe("POST /admin/sessions/clear", () => {
    test("rejects unauthenticated", async () => {
      const response = await handleRequest(
        mockFormRequest("/admin/sessions/clear", {
          csrf_token: "x",
        }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("rejects without CSRF", async () => {
      const response = await handleRequest(
        mockFormRequest(
          "/admin/sessions/clear",
          { csrf_token: "wrong" },
          cookie,
        ),
      );
      expect(response.status).toBe(403);
    });

    test("deletes other sessions and redirects to /admin/sessions", async () => {
      // Create a second session via login
      const auth2 = await loginAsAdmin();

      // Clear other sessions using first session
      const response = await handleRequest(
        mockFormRequest(
          "/admin/sessions/clear",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin/sessions");

      // Second session should be invalidated
      const response2 = await handleRequest(
        mockRequest("/admin", { headers: { cookie: auth2.cookie } }),
      );
      const html = await response2.text();
      expect(html).toContain("Username"); // login page
    });

    test("current session still works after clearing others", async () => {
      await handleRequest(
        mockFormRequest(
          "/admin/sessions/clear",
          { csrf_token: csrfToken },
          cookie,
        ),
      );

      // Current session should still work
      const response = await handleRequest(
        mockRequest("/admin", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Dashboard");
    });
  });
});
