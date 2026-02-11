import { afterEach, beforeEach, describe, expect, it } from "#test-compat";
import {
  createTestDbWithSetup,
  loginAsAdmin,
  mockRequest,
  resetDb,
} from "#test-utils";
import { clearToken } from "#xibo/client.ts";
import { cacheInvalidateAll } from "#xibo/cache.ts";
import { updateXiboCredentials } from "#lib/db/settings.ts";
import { createSession } from "#lib/db/sessions.ts";

const handle = async (req: Request): Promise<Response> => {
  const { handleRequest } = await import("#routes");
  return handleRequest(req);
};

/** Mock fetch to intercept Xibo API calls */
const mockXiboFetch = (
  handler: (url: string) => Response | null,
): { restore: () => void } => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;
    const result = handler(url);
    if (result) return Promise.resolve(result);
    return originalFetch(input, init);
  }) as typeof globalThis.fetch;
  return { restore: () => { globalThis.fetch = originalFetch; } };
};

const jsonResponse = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const tokenResponse = (): Response =>
  jsonResponse({ access_token: "test-tok", token_type: "Bearer", expires_in: 3600 });

describe("dashboard", () => {
  let cookie: string;

  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
    clearToken();
    await cacheInvalidateAll();
    const login = await loginAsAdmin();
    cookie = login.cookie;
  });

  afterEach(() => {
    clearToken();
    resetDb();
  });

  describe("GET /admin (authenticated, no Xibo configured)", () => {
    it("returns 200 with dashboard HTML", async () => {
      const res = await handle(mockRequest("/admin", { headers: { cookie } }));
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("Dashboard");
    });

    it("shows 'Not connected' status", async () => {
      const res = await handle(mockRequest("/admin", { headers: { cookie } }));
      const body = await res.text();
      expect(body).toContain("Not connected");
    });

    it("shows link to /admin/settings", async () => {
      const res = await handle(mockRequest("/admin", { headers: { cookie } }));
      const body = await res.text();
      expect(body).toContain("/admin/settings");
    });

    it("includes navigation bar", async () => {
      const res = await handle(mockRequest("/admin", { headers: { cookie } }));
      const body = await res.text();
      expect(body).toContain("<nav");
      expect(body).toContain("Logout");
    });

    it("includes Quick Links section", async () => {
      const res = await handle(mockRequest("/admin", { headers: { cookie } }));
      const body = await res.text();
      expect(body).toContain("Quick Links");
      expect(body).toContain("/admin/media");
    });
  });

  describe("GET /admin (authenticated, Xibo configured + connected)", () => {
    it("shows 'Connected' with CMS version and resource counts", async () => {
      await updateXiboCredentials("https://xibo.test", "id", "secret");
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token")) return tokenResponse();
        if (url.includes("/api/about"))
          return jsonResponse({ version: "3.2.1" });
        if (url.includes("/api/library")) return jsonResponse([{}]);
        if (url.includes("/api/layout")) return jsonResponse([{}, {}, {}]);
        if (url.includes("/api/dataset")) return jsonResponse([]);
        return null;
      });
      try {
        const res = await handle(mockRequest("/admin", { headers: { cookie } }));
        const body = await res.text();
        expect(body).toContain("Connected");
        expect(body).toContain("3.2.1");
      } finally {
        mock.restore();
      }
    });
  });

  describe("GET /admin (authenticated, Xibo configured but unreachable)", () => {
    it("shows 'Not connected' and still returns 200", async () => {
      await updateXiboCredentials("https://xibo.test", "id", "secret");
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return jsonResponse({ error: "fail" }, 401);
        return null;
      });
      try {
        const res = await handle(mockRequest("/admin", { headers: { cookie } }));
        expect(res.status).toBe(200);
        const body = await res.text();
        expect(body).toContain("Not connected");
      } finally {
        mock.restore();
      }
    });
  });

  describe("session expiry", () => {
    it("returns login page when session token is expired", async () => {
      // Create a session that's already expired
      const expiredToken = "expired-session-token-123";
      await createSession(expiredToken, "csrf", Date.now() - 1000, null, 1);

      const { hashSessionToken } = await import("#lib/crypto.ts");
      const _hash = await hashSessionToken(expiredToken);

      const res = await handle(
        mockRequest("/admin", {
          headers: { cookie: `__Host-session=${expiredToken}` },
        }),
      );
      const body = await res.text();
      expect(body).toContain("Login");
    });
  });

  describe("session with deleted user", () => {
    it("returns login page when session's user no longer exists", async () => {
      // Create session for non-existent user ID
      const orphanToken = "orphan-session-token-456";
      await createSession(orphanToken, "csrf", Date.now() + 86400000, null, 99999);

      const res = await handle(
        mockRequest("/admin", {
          headers: { cookie: `__Host-session=${orphanToken}` },
        }),
      );
      const body = await res.text();
      expect(body).toContain("Login");
    });
  });
});
