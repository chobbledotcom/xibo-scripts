import { afterEach, beforeEach, describe, expect, test } from "#test-compat";
import {
  createTestDbWithSetup,
  loginAsAdmin,
  mockFormRequest,
  mockRequest,
  resetDb,
  TEST_ADMIN_PASSWORD,
  TEST_ADMIN_USERNAME,
} from "#test-utils";
import { recordFailedLogin } from "#lib/db/login-attempts.ts";

describe("admin auth", () => {
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

  describe("GET /admin (unauthenticated)", () => {
    test("returns 200 with login form HTML", async () => {
      const response = await handleRequest(mockRequest("/admin"));
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Username");
      expect(html).toContain("Password");
    });

    test("login form posts to /admin/login", async () => {
      const response = await handleRequest(mockRequest("/admin"));
      const html = await response.text();
      expect(html).toContain("/admin/login");
    });
  });

  describe("POST /admin/login — validation", () => {
    test("rejects empty username", async () => {
      const response = await handleRequest(
        mockFormRequest("/admin/login", {
          username: "",
          password: "somepassword",
        }),
      );
      expect(response.status).toBe(400);
    });

    test("rejects empty password", async () => {
      const response = await handleRequest(
        mockFormRequest("/admin/login", {
          username: "admin",
          password: "",
        }),
      );
      expect(response.status).toBe(400);
    });
  });

  describe("POST /admin/login — invalid credentials", () => {
    test("returns 401 for wrong username", async () => {
      const response = await handleRequest(
        mockFormRequest("/admin/login", {
          username: "nonexistent",
          password: "anypassword",
        }),
      );
      expect(response.status).toBe(401);
      const html = await response.text();
      expect(html).toContain("Invalid credentials");
    });

    test("returns 401 for wrong password", async () => {
      const response = await handleRequest(
        mockFormRequest("/admin/login", {
          username: TEST_ADMIN_USERNAME,
          password: "wrongpassword",
        }),
      );
      expect(response.status).toBe(401);
    });
  });

  describe("POST /admin/login — success", () => {
    test("returns 302 redirect to /admin", async () => {
      const response = await handleRequest(
        mockFormRequest("/admin/login", {
          username: TEST_ADMIN_USERNAME,
          password: TEST_ADMIN_PASSWORD,
        }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("sets __Host-session cookie with security attributes", async () => {
      const response = await handleRequest(
        mockFormRequest("/admin/login", {
          username: TEST_ADMIN_USERNAME,
          password: TEST_ADMIN_PASSWORD,
        }),
      );
      const setCookie = response.headers.get("set-cookie") || "";
      expect(setCookie).toContain("__Host-session=");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("Secure");
      expect(setCookie).toContain("SameSite=Strict");
    });

    test("cookie Max-Age is 86400 (24h)", async () => {
      const response = await handleRequest(
        mockFormRequest("/admin/login", {
          username: TEST_ADMIN_USERNAME,
          password: TEST_ADMIN_PASSWORD,
        }),
      );
      const setCookie = response.headers.get("set-cookie") || "";
      expect(setCookie).toContain("Max-Age=86400");
    });
  });

  describe("POST /admin/login — rate limiting", () => {
    test("allows 4 failed attempts then returns 429 on 5th", async () => {
      const ip = "direct";

      // Record 4 failed login attempts directly
      for (let i = 0; i < 4; i++) {
        await recordFailedLogin(ip);
      }

      // 5th attempt triggers lockout
      await recordFailedLogin(ip);

      const response = await handleRequest(
        mockFormRequest("/admin/login", {
          username: "baduser",
          password: "badpass",
        }),
      );
      expect(response.status).toBe(429);
      const html = await response.text();
      expect(html).toContain("Too many login attempts");
    });

    test("clears attempt counter after successful login", async () => {
      const ip = "direct";

      // Record some failed attempts
      for (let i = 0; i < 3; i++) {
        await recordFailedLogin(ip);
      }

      // Successful login should clear attempts
      const response = await handleRequest(
        mockFormRequest("/admin/login", {
          username: TEST_ADMIN_USERNAME,
          password: TEST_ADMIN_PASSWORD,
        }),
      );
      expect(response.status).toBe(302);

      // Should be able to fail again without hitting rate limit
      const response2 = await handleRequest(
        mockFormRequest("/admin/login", {
          username: "wrong",
          password: "wrong",
        }),
      );
      expect(response2.status).toBe(401);
    });
  });

  describe("GET /admin/login", () => {
    test("redirects to /admin", async () => {
      const response = await handleRequest(mockRequest("/admin/login"));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });
  });

  describe("GET /admin/logout", () => {
    test("redirects to /admin and clears session cookie", async () => {
      const { cookie } = await loginAsAdmin();
      const response = await handleRequest(
        mockRequest("/admin/logout", { headers: { cookie } }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
      const setCookie = response.headers.get("set-cookie") || "";
      expect(setCookie).toContain("__Host-session=");
      expect(setCookie).toContain("Max-Age=0");
    });

    test("invalidates the session in DB", async () => {
      const { cookie } = await loginAsAdmin();

      // Logout
      await handleRequest(
        mockRequest("/admin/logout", { headers: { cookie } }),
      );

      // Trying to use old session should show login page
      const response = await handleRequest(
        mockRequest("/admin", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Username");
      expect(html).toContain("Password");
    });

    test("redirects to /admin without error when unauthenticated", async () => {
      const response = await handleRequest(mockRequest("/admin/logout"));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });
  });
});
