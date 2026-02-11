import { afterEach, beforeEach, describe, expect, it } from "#test-compat";
import {
  createTestDbWithSetup,
  handle,
  loginAsAdmin,
  mockFormRequest,
  mockRequest,
  resetDb,
} from "#test-utils";

describe("sessions management", () => {
  let cookie: string;
  let csrfToken: string;

  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
    const login = await loginAsAdmin();
    cookie = login.cookie;
    csrfToken = login.csrfToken;
  });

  afterEach(() => {
    resetDb();
  });

  describe("GET /admin/sessions (unauthenticated)", () => {
    it("redirects to /admin", async () => {
      const res = await handle(mockRequest("/admin/sessions"));
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/admin");
    });
  });

  describe("GET /admin/sessions (owner)", () => {
    it("returns 200 with sessions page", async () => {
      const res = await handle(
        mockRequest("/admin/sessions", { headers: { cookie } }),
      );
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("Active Sessions");
    });

    it("shows active session count", async () => {
      const res = await handle(
        mockRequest("/admin/sessions", { headers: { cookie } }),
      );
      const body = await res.text();
      expect(body).toContain("session(s)");
    });

    it("shows Clear Other Sessions button with CSRF token", async () => {
      const res = await handle(
        mockRequest("/admin/sessions", { headers: { cookie } }),
      );
      const body = await res.text();
      expect(body).toContain("Clear Other Sessions");
      expect(body).toContain("csrf_token");
    });
  });

  describe("POST /admin/sessions/clear", () => {
    it("rejects unauthenticated", async () => {
      const res = await handle(
        mockFormRequest("/admin/sessions/clear", { csrf_token: "x" }),
      );
      expect(res.status).toBe(302);
    });

    it("rejects without CSRF", async () => {
      const res = await handle(
        mockFormRequest("/admin/sessions/clear", {}, cookie),
      );
      expect(res.status).toBe(403);
    });

    it("deletes all sessions except current and redirects", async () => {
      // Create a second session by logging in again
      const login2 = await loginAsAdmin();

      const res = await handle(
        mockFormRequest(
          "/admin/sessions/clear",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/admin/sessions");

      // Second session should be invalid
      const res2 = await handle(
        mockRequest("/admin", { headers: { cookie: login2.cookie } }),
      );
      const body2 = await res2.text();
      expect(body2).toContain("Login");
    });

    it("current session still works after clearing others", async () => {
      await handle(
        mockFormRequest(
          "/admin/sessions/clear",
          { csrf_token: csrfToken },
          cookie,
        ),
      );

      // Current session still works
      const res = await handle(
        mockRequest("/admin", { headers: { cookie } }),
      );
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("Dashboard");
    });
  });
});
