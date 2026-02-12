import { afterEach, beforeEach, describe, expect, it } from "#test-compat";
import {
  createTestDbWithSetup,
  handle,
  loginAsAdmin,
  mockFormRequest,
  mockRequest,
  resetDb,
  TEST_ADMIN_PASSWORD,
  TEST_ADMIN_USERNAME,
} from "#test-utils";

/** Helper: attempt login with given credentials */
const attemptLogin = (username: string, password: string): Promise<Response> =>
  handle(mockFormRequest("/admin/login", { username, password }));

describe("login & authentication", () => {
  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
  });

  afterEach(() => {
    resetDb();
  });

  describe("GET /admin (unauthenticated)", () => {
    it("returns 200 with login form HTML", async () => {
      const res = await handle(mockRequest("/admin"));
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("Login");
    });

    it("login form has username and password fields", async () => {
      const res = await handle(mockRequest("/admin"));
      const body = await res.text();
      expect(body).toContain('name="username"');
      expect(body).toContain('name="password"');
    });

    it("login form posts to /admin/login", async () => {
      const res = await handle(mockRequest("/admin"));
      const body = await res.text();
      expect(body).toContain('action="/admin/login"');
    });
  });

  describe("POST /admin/login — validation", () => {
    it("rejects empty username", async () => {
      const res = await attemptLogin("", "password123");
      expect(res.status).toBe(400);
    });

    it("rejects empty password", async () => {
      const res = await attemptLogin("admin", "");
      expect(res.status).toBe(400);
    });
  });

  describe("POST /admin/login — invalid credentials", () => {
    it("returns 401 for wrong username", async () => {
      const res = await attemptLogin("wronguser", "wrongpass");
      expect(res.status).toBe(401);
    });

    it("returns 401 for wrong password", async () => {
      const res = await attemptLogin(TEST_ADMIN_USERNAME, "wrongpass");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /admin/login — success", () => {
    it("returns 302 redirect to /admin", async () => {
      const res = await attemptLogin(TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/admin");
    });

    it("sets __Host-session cookie with HttpOnly; Secure; SameSite=Strict", async () => {
      const res = await attemptLogin(TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD);
      const cookie = res.headers.get("set-cookie") || "";
      expect(cookie).toContain("__Host-session=");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=Strict");
    });

    it("cookie Max-Age is 86400 (24h)", async () => {
      const res = await attemptLogin(TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD);
      const cookie = res.headers.get("set-cookie") || "";
      expect(cookie).toContain("Max-Age=86400");
    });
  });

  describe("POST /admin/login — rate limiting", () => {
    const failLogin = () => attemptLogin(TEST_ADMIN_USERNAME, "wrong");

    it("allows 5 failed attempts before lockout", async () => {
      // Rate limit check runs BEFORE recording the failure.
      // After the 5th recordFailedLogin, locked_until is set.
      for (let i = 0; i < 5; i++) {
        const res = await failLogin();
        expect(res.status).toBe(401);
      }
    });

    it("returns 429 on 6th attempt (after lockout set)", async () => {
      for (let i = 0; i < 5; i++) {
        await failLogin();
      }
      // 6th attempt: isLoginRateLimited returns true
      const res = await failLogin();
      expect(res.status).toBe(429);
    });

    it("clears attempt counter after successful login", async () => {
      // Fail a few times, then succeed
      for (let i = 0; i < 3; i++) {
        await failLogin();
      }
      await attemptLogin(TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD);
      // Should be able to fail again without hitting 429
      const res = await failLogin();
      expect(res.status).toBe(401);
    });
  });

  describe("GET /admin/login", () => {
    it("redirects to /admin (convenience redirect)", async () => {
      const res = await handle(mockRequest("/admin/login"));
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/admin");
    });
  });

  describe("GET /admin/logout", () => {
    it("redirects to /admin", async () => {
      const { cookie } = await loginAsAdmin();
      const res = await handle(
        mockRequest("/admin/logout", { headers: { cookie } }),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/admin");
    });

    it("clears the __Host-session cookie", async () => {
      const { cookie } = await loginAsAdmin();
      const res = await handle(
        mockRequest("/admin/logout", { headers: { cookie } }),
      );
      const setCookie = res.headers.get("set-cookie") || "";
      expect(setCookie).toContain("__Host-session=");
      expect(setCookie).toContain("Max-Age=0");
    });

    it("invalidates the session in DB", async () => {
      const { cookie } = await loginAsAdmin();
      await handle(
        mockRequest("/admin/logout", { headers: { cookie } }),
      );
      // Using the same cookie should now show login page
      const res = await handle(
        mockRequest("/admin", { headers: { cookie } }),
      );
      const body = await res.text();
      expect(body).toContain("Login");
    });
  });

  describe("GET /admin/logout (unauthenticated)", () => {
    it("redirects to /admin without error", async () => {
      const res = await handle(mockRequest("/admin/logout"));
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/admin");
    });
  });

  describe("POST /admin/login — user with password can log in", () => {
    it("returns 302 for user who set password via invite", async () => {
      const { createInvitedUser, setUserPassword, hashInviteCode } = await import(
        "#lib/db/users.ts"
      );
      const codeHash = await hashInviteCode("invite-123");
      const user = await createInvitedUser(
        "inviteduser",
        "manager",
        codeHash,
        new Date(Date.now() + 86400000).toISOString(),
      );
      await setUserPassword(user.id, "validpassword");

      const res = await attemptLogin("inviteduser", "validpassword");
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/admin");
    });
  });

  describe("POST /admin/login — randomDelay with real setTimeout", () => {
    it("exercises the real setTimeout delay when TEST_SKIP_LOGIN_DELAY is unset", async () => {
      // Temporarily remove TEST_SKIP_LOGIN_DELAY to exercise the real setTimeout branch
      const savedDelay = Deno.env.get("TEST_SKIP_LOGIN_DELAY");
      Deno.env.delete("TEST_SKIP_LOGIN_DELAY");

      try {
        const start = Date.now();
        // This login will include a real 100-200ms delay
        const res = await attemptLogin(TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD);
        const elapsed = Date.now() - start;

        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/admin");
        // The randomDelay adds 100-200ms; with crypto overhead, total should be > 100ms
        expect(elapsed).toBeGreaterThanOrEqual(100);
      } finally {
        // Restore the env var
        if (savedDelay) {
          Deno.env.set("TEST_SKIP_LOGIN_DELAY", savedDelay);
        } else {
          Deno.env.delete("TEST_SKIP_LOGIN_DELAY");
        }
      }
    });
  });
});
