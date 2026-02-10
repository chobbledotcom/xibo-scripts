/**
 * Tests for layout admin routes
 *
 * Mocks globalThis.fetch to intercept Xibo API calls.
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
import type { XiboLayout, XiboMenuBoard, XiboCategory, XiboProduct } from "#xibo/types.ts";

const XIBO_URL = "https://xibo.test";
const XIBO_CLIENT_ID = "test-client-id";
const XIBO_CLIENT_SECRET = "test-client-secret";

const sampleLayouts: XiboLayout[] = [
  {
    layoutId: 1,
    layout: "Menu - Drinks",
    description: "Auto-generated layout",
    status: 3,
    width: 1080,
    height: 1920,
    publishedStatusId: 1,
  },
  {
    layoutId: 2,
    layout: "Menu - Food",
    description: "",
    status: 2,
    width: 1080,
    height: 1920,
    publishedStatusId: 2,
  },
];

const sampleBoards: XiboMenuBoard[] = [
  {
    menuBoardId: 1,
    name: "Main Menu",
    code: "MM",
    description: "Main menu board",
    modifiedDt: "2024-01-01",
  },
];

const sampleCategories: XiboCategory[] = [
  {
    menuCategoryId: 10,
    menuId: 1,
    name: "Drinks",
    code: "DRK",
    mediaId: null,
  },
];

const sampleProducts: XiboProduct[] = [
  {
    menuProductId: 100,
    menuCategoryId: 10,
    name: "Coffee",
    price: "3.50",
    calories: "5",
    allergyInfo: "",
    availability: 1,
    description: "Hot coffee",
    mediaId: null,
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
): typeof globalThis.fetch => {
  return (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    // Handle Xibo OAuth token request
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

    // Check registered handlers for API endpoints
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        return Promise.resolve(handler(url, init));
      }
    }

    // Pass through non-Xibo requests
    return originalFetch(input, init);
  };
};

/** JSON response helper */
const jsonResponse = (data: unknown): Response =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });

describe("layout routes", () => {
  let cookie: string;
  let csrfToken: string;

  beforeEach(async () => {
    await createTestDbWithSetup();
    await updateXiboCredentials(XIBO_URL, XIBO_CLIENT_ID, XIBO_CLIENT_SECRET);
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

  /** Clear Xibo credentials */
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

    test("renders layout list page with data", async () => {
      globalThis.fetch = createMockFetch({
        "/api/layout": () => jsonResponse(sampleLayouts),
      });

      const response = await handleRequest(
        mockRequest("/admin/layouts", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Layouts");
      expect(html).toContain("Menu - Drinks");
      expect(html).toContain("Menu - Food");
      expect(html).toContain("Published");
      expect(html).toContain("Draft");
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

    test("renders with success query param", async () => {
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
      expect(html).toContain("Menu - Drinks");
      expect(html).toContain("1080x1920");
      expect(html).toContain("Grid Preview");
      expect(html).toContain("Delete Layout");
    });

    test("returns 404 when layout not found", async () => {
      globalThis.fetch = createMockFetch({
        "/api/layout": () => jsonResponse([]),
      });

      const response = await handleRequest(
        mockRequest("/admin/layout/999", { headers: { cookie } }),
      );
      expect(response.status).toBe(404);
    });
  });

  describe("GET /admin/layout/create", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handleRequest(
        mockRequest("/admin/layout/create"),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("renders create form with categories", async () => {
      globalThis.fetch = createMockFetch({
        "/api/menuboard/1/category": () => jsonResponse(sampleCategories),
        "/api/menuboard": () => jsonResponse(sampleBoards),
      });

      const response = await handleRequest(
        mockRequest("/admin/layout/create", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Create Layout");
      expect(html).toContain("Main Menu");
      expect(html).toContain("Drinks");
    });

    test("shows message when no categories available", async () => {
      globalThis.fetch = createMockFetch({
        "/api/menuboard": () => jsonResponse([]),
      });

      const response = await handleRequest(
        mockRequest("/admin/layout/create", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("No menu board categories available");
    });
  });

  describe("POST /admin/layout/create", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handleRequest(
        mockFormRequest("/admin/layout/create", {
          csrf_token: "bad",
          category: "1:10",
        }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("redirects when category value is empty", async () => {
      globalThis.fetch = createMockFetch({});

      const response = await handleRequest(
        mockFormRequest(
          "/admin/layout/create",
          { csrf_token: csrfToken, category: "" },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin/layout/create");
    });

    test("redirects when category value is malformed", async () => {
      globalThis.fetch = createMockFetch({});

      const response = await handleRequest(
        mockFormRequest(
          "/admin/layout/create",
          { csrf_token: csrfToken, category: "invalid" },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin/layout/create");
    });

    test("creates layout and redirects with success", async () => {
      globalThis.fetch = createMockFetch({
        "/api/menuboard/1/category": () => jsonResponse(sampleCategories),
        "/api/menuboard/1/product": () => jsonResponse(sampleProducts),
        "/api/resolution": () =>
          jsonResponse([
            { resolutionId: 1, resolution: "Portrait", width: 1080, height: 1920 },
          ]),
        "/api/layout/publish": () => jsonResponse({}),
        "/api/layout": (_url: string, init?: RequestInit) => {
          if (init?.method === "POST") {
            return jsonResponse({
              layoutId: 50,
              layout: "Menu - Drinks",
              description: "",
              status: 2,
              width: 1080,
              height: 1920,
              publishedStatusId: 2,
            });
          }
          return jsonResponse([]);
        },
        "/api/region/": () =>
          jsonResponse({ regions: [{ regionId: 1, width: 100, height: 100, top: 0, left: 0, zIndex: 0 }] }),
        "/api/playlist/widget": () => jsonResponse({ widgetId: 1 }),
      });

      const response = await handleRequest(
        mockFormRequest(
          "/admin/layout/create",
          { csrf_token: csrfToken, category: "1:10" },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location") || "";
      expect(location).toContain("/admin/layout/50");
      expect(location).toContain("success=");
    });

    test("redirects with error when category not found", async () => {
      globalThis.fetch = createMockFetch({
        "/api/menuboard/1/category": () => jsonResponse([]),
      });

      const response = await handleRequest(
        mockFormRequest(
          "/admin/layout/create",
          { csrf_token: csrfToken, category: "1:999" },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location") || "";
      expect(location).toContain("error=");
      expect(location).toContain("Category");
      expect(location).toContain("not");
      expect(location).toContain("found");
    });
  });

  describe("POST /admin/layout/:id/delete", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handleRequest(
        mockFormRequest("/admin/layout/1/delete", {
          csrf_token: "bad",
        }),
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
          new Response("Cannot delete", { status: 422 }),
      });

      const response = await handleRequest(
        mockFormRequest(
          "/admin/layout/1/delete",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location") || "";
      expect(location).toContain("error=");
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
      let deleteCount = 0;
      globalThis.fetch = createMockFetch({
        "/api/layout": (_url: string, init?: RequestInit) => {
          if (init?.method === "DELETE") {
            deleteCount++;
            return new Response(null, { status: 204 });
          }
          return jsonResponse(sampleLayouts);
        },
      });

      const response = await handleRequest(
        mockFormRequest(
          "/admin/layouts/delete-all",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("success=");
      expect(deleteCount).toBe(2);
    });

    test("counts only successfully deleted layouts", async () => {
      globalThis.fetch = createMockFetch({
        "/api/layout/1": () => new Response(null, { status: 204 }),
        "/api/layout/2": () =>
          new Response("Cannot delete", { status: 422 }),
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
      expect(response.headers.get("location")).toContain("success=");
    });

    test("redirects with error when list fetch fails", async () => {
      globalThis.fetch = createMockFetch({
        "/api/layout": () => new Response("Error", { status: 500 }),
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
      expect(location).toContain("error=");
    });
  });
});
