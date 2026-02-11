/**
 * Tests for layout admin routes
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "#test-compat";
import {
  createTestDbWithSetup,
  loginAsAdmin,
  mockFormRequest,
  mockRequest,
  resetDb,
} from "#test-utils";
import {
  invalidateSettingsCache,
  updateXiboCredentials,
} from "#lib/db/settings.ts";
import { clearToken } from "#xibo/client.ts";
import { cacheInvalidateAll } from "#xibo/cache.ts";
import type { XiboLayout } from "#xibo/types.ts";

const XIBO_URL = "https://xibo.test";

const sampleLayouts: XiboLayout[] = [
  {
    layoutId: 1,
    layout: "Menu - Burgers",
    description: "Auto-generated layout",
    status: 3,
    width: 1080,
    height: 1920,
    publishedStatusId: 1,
  },
  {
    layoutId: 2,
    layout: "Menu - Drinks",
    description: "",
    status: 1,
    width: 1080,
    height: 1920,
    publishedStatusId: 0,
  },
];

/** Original fetch for restore */
const originalFetch = globalThis.fetch;

/**
 * Create a mock fetch that intercepts Xibo API calls.
 */
const createMockFetch = (
  handlers: Record<
    string,
    (url: string, init?: RequestInit) => Response | Promise<Response>
  >,
): typeof globalThis.fetch =>
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;

    if (url.includes("/api/authorize/access_token")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: "test-token",
            token_type: "Bearer",
            expires_in: 3600,
          }),
          { headers: { "content-type": "application/json" } },
        ),
      );
    }

    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        return Promise.resolve(handler(url, init));
      }
    }

    return originalFetch(input, init);
  };

const jsonResponse = (data: unknown): Response =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });

describe("layout routes", () => {
  let cookie: string;
  let csrfToken: string;

  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
    await updateXiboCredentials(XIBO_URL, "test-id", "test-secret");
    clearToken();
    await cacheInvalidateAll();

    const auth = await loginAsAdmin();
    cookie = auth.cookie;
    csrfToken = auth.csrfToken;
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

  const clearXiboConfig = async (): Promise<void> => {
    await updateXiboCredentials("", "", "");
    invalidateSettingsCache();
    await cacheInvalidateAll();
  };

  describe("GET /admin/layouts", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handleRequest(mockRequest("/admin/layouts"));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("redirects to settings when Xibo not configured", async () => {
      await clearXiboConfig();
      const response = await handleRequest(
        mockRequest("/admin/layouts", { headers: { cookie } }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("/admin/settings");
    });

    test("renders layout list with data", async () => {
      globalThis.fetch = createMockFetch({
        "/api/layout": () => jsonResponse(sampleLayouts),
      });
      const response = await handleRequest(
        mockRequest("/admin/layouts", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Layouts");
      expect(html).toContain("Menu - Burgers");
      expect(html).toContain("Menu - Drinks");
    });

    test("renders empty layout list", async () => {
      globalThis.fetch = createMockFetch({
        "/api/layout": () => jsonResponse([]),
      });
      const response = await handleRequest(
        mockRequest("/admin/layouts", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("No layouts found");
    });

    test("shows error when API fails", async () => {
      await cacheInvalidateAll();
      globalThis.fetch = createMockFetch({
        "/api/layout": () => new Response("Server Error", { status: 500 }),
      });
      const response = await handleRequest(
        mockRequest("/admin/layouts", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("API request failed");
    });

    test("shows success message from query param", async () => {
      globalThis.fetch = createMockFetch({
        "/api/layout": () => jsonResponse([]),
      });
      const response = await handleRequest(
        mockRequest("/admin/layouts?success=Layout+deleted", {
          headers: { cookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Layout deleted");
    });
  });

  describe("GET /admin/layout/:id", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handleRequest(mockRequest("/admin/layout/1"));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("renders layout detail page", async () => {
      globalThis.fetch = createMockFetch({
        "/api/layout": () => jsonResponse([sampleLayouts[0]]),
      });
      const response = await handleRequest(
        mockRequest("/admin/layout/1", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Menu - Burgers");
      expect(html).toContain("1080x1920");
      expect(html).toContain("Published");
    });

    test("returns 404 for non-existent layout", async () => {
      globalThis.fetch = createMockFetch({
        "/api/layout": () => jsonResponse([]),
      });
      const response = await handleRequest(
        mockRequest("/admin/layout/999", { headers: { cookie } }),
      );
      expect(response.status).toBe(404);
    });
  });

  describe("POST /admin/layout/:id/delete", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handleRequest(
        mockFormRequest("/admin/layout/1/delete", { csrf_token: "bad" }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("deletes layout and redirects with success", async () => {
      globalThis.fetch = createMockFetch({
        "/api/layout/1": () => new Response(null, { status: 204 }),
      });
      const response = await handleRequest(
        mockFormRequest(
          "/admin/layout/1/delete",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        "/admin/layouts?success=",
      );
    });

    test("redirects with error when delete fails", async () => {
      globalThis.fetch = createMockFetch({
        "/api/layout/1": () =>
          new Response("Server Error", { status: 500 }),
      });
      const response = await handleRequest(
        mockFormRequest(
          "/admin/layout/1/delete",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        "/admin/layouts?error=",
      );
    });
  });

  describe("POST /admin/layouts/delete-all", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handleRequest(
        mockFormRequest("/admin/layouts/delete-all", {
          csrf_token: "bad",
        }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("deletes all layouts and redirects with success", async () => {
      await cacheInvalidateAll();
      globalThis.fetch = createMockFetch({
        "/api/layout/": () => new Response(null, { status: 204 }),
        "/api/layout": () => jsonResponse(sampleLayouts),
      });
      const response = await handleRequest(
        mockFormRequest(
          "/admin/layouts/delete-all",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location") || "";
      expect(location).toContain("/admin/layouts?success=");
      expect(location).toContain("Deleted");
    });

    test("redirects with error when delete-all fails", async () => {
      await cacheInvalidateAll();
      globalThis.fetch = createMockFetch({
        "/api/layout": () =>
          new Response("Server Error", { status: 500 }),
      });
      const response = await handleRequest(
        mockFormRequest(
          "/admin/layouts/delete-all",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        "/admin/layouts?error=",
      );
    });
  });
});
