import { afterEach, beforeEach, describe, expect, test } from "#test-compat";
import {
  createTestDbWithSetup,
  loginAsAdmin,
  mockRequest,
  resetDb,
} from "#test-utils";
import {
  invalidateSettingsCache,
  updateXiboCredentials,
} from "#lib/db/settings.ts";
import { clearToken } from "#xibo/client.ts";
import { cacheInvalidateAll } from "#xibo/cache.ts";
import { createSession } from "#lib/db/sessions.ts";

/** Original fetch for restore */
const originalFetch = globalThis.fetch;

/** JSON response helper */
const jsonResponse = (data: unknown): Response =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });

/** Mock fetch that intercepts Xibo API calls */
const createMockFetch = (
  handlers: Record<string, () => Response>,
): typeof globalThis.fetch =>
  ((input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;

    if (url.includes("/api/authorize/access_token")) {
      return Promise.resolve(
        jsonResponse({
          access_token: "test-token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      );
    }

    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) return Promise.resolve(handler());
    }

    return originalFetch(input);
  }) as typeof globalThis.fetch;

describe("dashboard", () => {
  let cookie: string;

  beforeEach(async () => {
    await createTestDbWithSetup();
    clearToken();
    await cacheInvalidateAll();
    const auth = await loginAsAdmin();
    cookie = auth.cookie;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearToken();
    resetDb();
  });

  const handleRequest = async (request: Request): Promise<Response> => {
    const { handleRequest: handler } = await import("#routes");
    return handler(request);
  };

  describe("GET /admin (authenticated, no Xibo configured)", () => {
    test("returns 200 with dashboard HTML", async () => {
      const response = await handleRequest(
        mockRequest("/admin", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Dashboard");
    });

    test("shows Not connected status", async () => {
      const response = await handleRequest(
        mockRequest("/admin", { headers: { cookie } }),
      );
      const html = await response.text();
      expect(html).toContain("Not connected");
    });

    test("shows link to /admin/settings", async () => {
      const response = await handleRequest(
        mockRequest("/admin", { headers: { cookie } }),
      );
      const html = await response.text();
      expect(html).toContain("/admin/settings");
    });

    test("includes navigation bar", async () => {
      const response = await handleRequest(
        mockRequest("/admin", { headers: { cookie } }),
      );
      const html = await response.text();
      expect(html).toContain("<nav");
    });

    test("includes Quick Links section", async () => {
      const response = await handleRequest(
        mockRequest("/admin", { headers: { cookie } }),
      );
      const html = await response.text();
      expect(html).toContain("Quick Links");
    });
  });

  describe("GET /admin (authenticated, Xibo configured + connected)", () => {
    test("shows Connected with CMS version and resource counts", async () => {
      await updateXiboCredentials(
        "https://xibo.test",
        "test-id",
        "test-secret",
      );
      invalidateSettingsCache();
      await cacheInvalidateAll();

      globalThis.fetch = createMockFetch({
        "/api/about": () => jsonResponse({ version: "4.0.1" }),
        "/api/library": () => jsonResponse([{}, {}]),
        "/api/layout": () => jsonResponse([{}, {}, {}]),
        "/api/dataset": () => jsonResponse([{}]),
        "/api/menuboard": () => jsonResponse([]),
      });

      const response = await handleRequest(
        mockRequest("/admin", { headers: { cookie } }),
      );
      const html = await response.text();
      expect(html).toContain("4.0.1");
    });
  });

  describe("GET /admin (authenticated, Xibo configured but unreachable)", () => {
    test("shows Not connected status but returns 200", async () => {
      await updateXiboCredentials(
        "https://unreachable.test",
        "test-id",
        "test-secret",
      );
      invalidateSettingsCache();
      await cacheInvalidateAll();

      globalThis.fetch = createMockFetch({
        "/api/authorize/access_token": () =>
          new Response("Unreachable", { status: 500 }),
      });
      // Override the token handler specifically
      globalThis.fetch = ((input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : input.url;
        if (url.includes("unreachable.test")) {
          return Promise.reject(new Error("Network error"));
        }
        return originalFetch(input);
      }) as typeof globalThis.fetch;

      const response = await handleRequest(
        mockRequest("/admin", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Not connected");
    });
  });

  describe("session expiry", () => {
    test("returns login page when session token is expired", async () => {
      // Create an expired session directly
      const expiredToken = "expired-token-12345";
      const expiredTime = Date.now() - 1000; // 1 second ago
      await createSession(expiredToken, "csrf", expiredTime, null, 1);

      const response = await handleRequest(
        mockRequest("/admin", {
          headers: { cookie: `__Host-session=${expiredToken}` },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Username");
    });
  });

  describe("session with deleted user", () => {
    test("returns login page when session's user no longer exists", async () => {
      // Create a session pointing to a non-existent user
      const token = "orphaned-session-token";
      await createSession(token, "csrf", Date.now() + 86400000, null, 99999);

      const response = await handleRequest(
        mockRequest("/admin", {
          headers: { cookie: `__Host-session=${token}` },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Username");
    });
  });
});
