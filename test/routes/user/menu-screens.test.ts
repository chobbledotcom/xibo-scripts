/**
 * Tests for user menu screen routes (/dashboard/business/:bizId/screen/:screenId/menu*)
 *
 * Tests menu screen CRUD via mocked Xibo API, access control,
 * template selection, and product picking.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "#test-compat";
import {
  assignUserToBusiness,
  createBusiness,
  updateBusinessXiboIds,
} from "#lib/db/businesses.ts";
import { createScreen } from "#lib/db/screens.ts";
import {
  createMenuScreen,
  getMenuScreenById,
  getMenuScreensForScreen,
  setMenuScreenItems,
  updateMenuScreenLayoutId,
} from "#lib/db/menu-screens.ts";
import { updateXiboCredentials } from "#lib/db/settings.ts";
import { clearToken } from "#xibo/client.ts";
import { cacheInvalidateAll } from "#xibo/cache.ts";
import {
  createActivateAndLogin,
  createMockFetch,
  createTestDbWithSetup,
  handle,
  jsonResponse,
  mockFormRequest,
  mockRequest,
  resetDb,
  restoreFetch,
} from "#test-utils";

const XIBO_URL = "https://xibo.test";
const DATASET_ID = 500;
const BUSINESS_FOLDER_ID = 100;

const sampleProducts = [
  { id: 1, name: "Vanilla", price: "3.50", media_id: null, available: 1, sort_order: 0 },
  { id: 2, name: "Chocolate", price: "4.00", media_id: null, available: 1, sort_order: 1 },
  { id: 3, name: "Strawberry", price: "3.75", media_id: null, available: 0, sort_order: 2 },
];

/** Standard mock fetch for menu screen operations */
const createMenuScreenMockFetch = () =>
  createMockFetch({
    [`/api/dataset/data/${DATASET_ID}`]: () => jsonResponse(sampleProducts),
    "/api/resolution": () =>
      jsonResponse([{ resolutionId: 1, resolution: "1080x1920", width: 1080, height: 1920 }]),
    "/api/layout": (_url, init) => {
      if (init?.method === "POST") {
        return jsonResponse({ layoutId: 100, layout: "Test", description: "", status: 1, width: 1080, height: 1920, publishedStatusId: 1 });
      }
      if (init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      return jsonResponse([]);
    },
    "/api/region/": () =>
      jsonResponse({ regionId: 1, width: 100, height: 100, top: 0, left: 0, zIndex: 0 }),
    "/api/playlist/widget/text/": () =>
      jsonResponse({ widgetId: 1, type: "text", displayOrder: 1 }),
    "/api/layout/publish/": () => jsonResponse({}),
    "/api/campaign": (_url, init) => {
      if (init?.method === "POST" && !_url.includes("/layout/assign")) {
        return jsonResponse({ campaignId: 50, campaign: "Screen", isLayoutSpecific: 0, totalDuration: 0 });
      }
      if (_url.includes("/layout/assign")) {
        return jsonResponse({});
      }
      if (init?.method === "PUT") {
        return jsonResponse({ campaignId: 50, campaign: "Screen", isLayoutSpecific: 0, totalDuration: 0 });
      }
      if (init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      return jsonResponse([{ campaignId: 50, campaign: "Screen", isLayoutSpecific: 0, totalDuration: 0 }]);
    },
    "/api/schedule": (_url, init) => {
      if (init?.method === "POST") {
        return jsonResponse({ eventId: 1, eventTypeId: 1, campaignId: 50, displayGroupIds: [1], fromDt: null, toDt: null, isPriority: 0 });
      }
      return jsonResponse([]);
    },
  });

describe("user menu screen routes", () => {
  let userCookie: string;
  let userCsrfToken: string;
  let userId: number;
  let businessId: number;
  let screenId: number;

  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
    await updateXiboCredentials(XIBO_URL, "test-id", "test-secret");
    clearToken();
    await cacheInvalidateAll();

    const biz = await createBusiness("Test Business");
    businessId = biz.id;
    await updateBusinessXiboIds(businessId, BUSINESS_FOLDER_ID, "test-biz-abc", DATASET_ID);

    const screen = await createScreen("Main Screen", businessId, 1);
    screenId = screen.id;

    const user = await createActivateAndLogin("menuuser", "user", "userpass123");
    userCookie = user.cookie;
    userCsrfToken = user.csrfToken;
    userId = user.userId;
    await assignUserToBusiness(businessId, userId);
  });

  afterEach(() => {
    restoreFetch();
    clearToken();
    resetDb();
  });

  describe("GET /dashboard/business/:bizId/screen/:screenId/menus", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/screen/${screenId}/menus`),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("shows empty menu screen list", async () => {
      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/screen/${screenId}/menus`, {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Menu Screens");
      expect(html).toContain("No menu screens yet");
    });

    test("shows menu screens when they exist", async () => {
      const ms = await createMenuScreen("Morning Menu", screenId, "grid-3x4", 30, 1);
      await updateMenuScreenLayoutId(ms.id, 100);

      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/screen/${screenId}/menus`, {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Morning Menu");
      expect(html).toContain("grid-3x4");
      expect(html).toContain("30s");
    });

    test("returns 403 when user not assigned to business", async () => {
      const otherBiz = await createBusiness("Other Biz");
      const otherUser = await createActivateAndLogin("other", "user", "pass12345");
      await assignUserToBusiness(otherBiz.id, otherUser.userId);

      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/screen/${screenId}/menus`, {
          headers: { cookie: otherUser.cookie },
        }),
      );
      expect(response.status).toBe(403);
    });

    test("returns 404 when screen not found", async () => {
      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/screen/999/menus`, {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(404);
    });

    test("shows success message from query param", async () => {
      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockRequest(
          `/dashboard/business/${businessId}/screen/${screenId}/menus?success=Menu+screen+created`,
          { headers: { cookie: userCookie } },
        ),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Menu screen created");
    });
  });

  describe("GET /dashboard/business/:bizId/screen/:screenId/menu/create", () => {
    test("renders create form with templates and products", async () => {
      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/screen/${screenId}/menu/create`, {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Add Menu Screen");
      expect(html).toContain("grid-3x4");
      expect(html).toContain("list-6");
      expect(html).toContain("Vanilla");
      expect(html).toContain("Chocolate");
    });

    test("redirects to login when not authenticated", async () => {
      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/screen/${screenId}/menu/create`),
      );
      expect(response.status).toBe(302);
    });

    test("renders form with empty products when business has no dataset", async () => {
      const noBiz = await createBusiness("No DS Business");
      await assignUserToBusiness(noBiz.id, userId);
      const noScreen = await createScreen("No DS Screen2", noBiz.id, 1);

      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockRequest(`/dashboard/business/${noBiz.id}/screen/${noScreen.id}/menu/create`, {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Add Menu Screen");
      expect(html).toContain("No products available");
    });

    test("renders form with empty products on API failure", async () => {
      globalThis.fetch = createMockFetch({
        [`/api/dataset/data/${DATASET_ID}`]: () => new Response("Error", { status: 500 }),
      });

      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/screen/${screenId}/menu/create`, {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Add Menu Screen");
      expect(html).not.toContain("Vanilla");
    });
  });

  describe("POST /dashboard/business/:bizId/screen/:screenId/menu/create", () => {
    test("creates menu screen and redirects", async () => {
      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/screen/${screenId}/menu/create`,
          {
            csrf_token: userCsrfToken,
            name: "Morning Menu",
            display_time: "30",
            sort_order: "1",
            template_id: "grid-3x4",
            product_ids: "1",
          },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("success=");

      const menuScreens = await getMenuScreensForScreen(screenId);
      expect(menuScreens.length).toBe(1);
    });

    test("returns 400 when name is missing", async () => {
      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/screen/${screenId}/menu/create`,
          {
            csrf_token: userCsrfToken,
            display_time: "30",
            sort_order: "1",
            template_id: "grid-3x4",
          },
          userCookie,
        ),
      );
      expect(response.status).toBe(400);
    });

    test("redirects with error for invalid template", async () => {
      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/screen/${screenId}/menu/create`,
          {
            csrf_token: userCsrfToken,
            name: "Bad Template",
            display_time: "30",
            sort_order: "1",
            template_id: "nonexistent",
          },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("error=");
      expect(response.headers.get("location")).toContain("Invalid%20template");
    });

    test("returns 403 for invalid CSRF token", async () => {
      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/screen/${screenId}/menu/create`,
          {
            csrf_token: "wrong-token",
            name: "Test",
            display_time: "30",
            sort_order: "1",
            template_id: "grid-3x4",
          },
          userCookie,
        ),
      );
      expect(response.status).toBe(403);
    });

    test("returns 403 when user not assigned to business", async () => {
      const otherUser = await createActivateAndLogin("other2", "user", "pass12345");
      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/screen/${screenId}/menu/create`,
          {
            csrf_token: otherUser.csrfToken,
            name: "Test",
            display_time: "30",
            sort_order: "1",
            template_id: "grid-3x4",
          },
          otherUser.cookie,
        ),
      );
      expect(response.status).toBe(403);
    });

    test("redirects with error when too many products selected", async () => {
      globalThis.fetch = createMenuScreenMockFetch();

      // grid-3x4 has maxProducts=12, so 13 product_ids should fail
      const params = new URLSearchParams();
      params.append("csrf_token", userCsrfToken);
      params.append("name", "Too Many Products");
      params.append("display_time", "30");
      params.append("sort_order", "1");
      params.append("template_id", "grid-3x4");
      for (let i = 1; i <= 13; i++) {
        params.append("product_ids", String(i));
      }

      const request = new Request(
        `http://localhost/dashboard/business/${businessId}/screen/${screenId}/menu/create`,
        {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            host: "localhost",
            cookie: userCookie,
          },
          body: params.toString(),
        },
      );

      const response = await handle(request);
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("error=");
      expect(response.headers.get("location")).toContain("Too%20many%20products");
    });

    test("creates menu screen with null dataset (fetchTemplateProducts early return)", async () => {
      // Create a business without dataset ID
      const noBiz = await createBusiness("No Dataset Biz");
      await assignUserToBusiness(noBiz.id, userId);
      const noScreen = await createScreen("No DS Screen", noBiz.id, 1);

      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${noBiz.id}/screen/${noScreen.id}/menu/create`,
          {
            csrf_token: userCsrfToken,
            name: "No Dataset Menu",
            display_time: "30",
            sort_order: "1",
            template_id: "grid-3x4",
            product_ids: "1",
          },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("success=");
    });

    test("creates menu screen with null displayId (refreshSchedule early return)", async () => {
      const noDisplayScreen = await createScreen("No Display Screen", businessId, null);

      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/screen/${noDisplayScreen.id}/menu/create`,
          {
            csrf_token: userCsrfToken,
            name: "No Display Menu",
            display_time: "30",
            sort_order: "1",
            template_id: "grid-3x4",
            product_ids: "1",
          },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("success=");
    });

    test("redirects with error when layout building fails (menuScreenAction catch)", async () => {
      // Mock fetch that fails on layout creation
      globalThis.fetch = createMockFetch({
        "/api/resolution": () =>
          jsonResponse([{ resolutionId: 1, resolution: "1080x1920", width: 1080, height: 1920 }]),
        "/api/layout": () => new Response("Internal Server Error", { status: 500 }),
      });

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/screen/${screenId}/menu/create`,
          {
            csrf_token: userCsrfToken,
            name: "Fail Menu",
            display_time: "30",
            sort_order: "1",
            template_id: "grid-3x4",
            product_ids: "1",
          },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("error=");
    });
  });

  describe("GET /dashboard/business/:bizId/screen/:screenId/menu/:id", () => {
    test("renders edit form with menu screen data", async () => {
      const ms = await createMenuScreen("Edit Me", screenId, "grid-3x4", 20, 0);
      await setMenuScreenItems(ms.id, [1, 2]);

      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockRequest(
          `/dashboard/business/${businessId}/screen/${screenId}/menu/${ms.id}`,
          { headers: { cookie: userCookie } },
        ),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Edit Edit Me");
      expect(html).toContain("grid-3x4");
    });

    test("redirects with error when menu screen not found", async () => {
      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockRequest(
          `/dashboard/business/${businessId}/screen/${screenId}/menu/999`,
          { headers: { cookie: userCookie } },
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("error=");
    });

    test("redirects with error when menu screen belongs to different screen", async () => {
      const otherScreen = await createScreen("Other Screen", businessId, null);
      const ms = await createMenuScreen("Wrong Screen", otherScreen.id, "grid-3x4", 20, 0);

      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockRequest(
          `/dashboard/business/${businessId}/screen/${screenId}/menu/${ms.id}`,
          { headers: { cookie: userCookie } },
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("error=");
    });
  });

  describe("POST /dashboard/business/:bizId/screen/:screenId/menu/:id", () => {
    test("updates menu screen and redirects", async () => {
      const ms = await createMenuScreen("Update Me", screenId, "grid-3x4", 20, 0);
      await updateMenuScreenLayoutId(ms.id, 100);

      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/screen/${screenId}/menu/${ms.id}`,
          {
            csrf_token: userCsrfToken,
            name: "Updated Menu",
            display_time: "45",
            sort_order: "2",
            template_id: "list-6",
            product_ids: "1",
          },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("success=");

      const updated = await getMenuScreenById(ms.id);
      expect(updated!.template_id).toBe("list-6");
      expect(updated!.display_time).toBe(45);
    });

    test("redirects with error when menu screen not found", async () => {
      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/screen/${screenId}/menu/999`,
          {
            csrf_token: userCsrfToken,
            name: "Nonexistent",
            display_time: "30",
            sort_order: "1",
            template_id: "grid-3x4",
          },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("error=");
    });

    test("updates menu screen with null layoutId (deleteOldLayout early return)", async () => {
      // Create menu screen without setting a layout ID
      const ms = await createMenuScreen("No Layout", screenId, "grid-3x4", 20, 0);

      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/screen/${screenId}/menu/${ms.id}`,
          {
            csrf_token: userCsrfToken,
            name: "Updated No Layout",
            display_time: "45",
            sort_order: "2",
            template_id: "list-6",
            product_ids: "1",
          },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("success=");
    });

    test("returns 400 when validation fails", async () => {
      const ms = await createMenuScreen("Bad Update", screenId, "grid-3x4", 20, 0);
      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/screen/${screenId}/menu/${ms.id}`,
          {
            csrf_token: userCsrfToken,
            name: "",
            display_time: "30",
            sort_order: "1",
            template_id: "grid-3x4",
          },
          userCookie,
        ),
      );
      expect(response.status).toBe(400);
    });
  });

  describe("POST /dashboard/business/:bizId/screen/:screenId/menu/:id/delete", () => {
    test("deletes menu screen and redirects", async () => {
      const ms = await createMenuScreen("Delete Me", screenId, "grid-3x4", 20, 0);
      await updateMenuScreenLayoutId(ms.id, 100);

      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/screen/${screenId}/menu/${ms.id}/delete`,
          { csrf_token: userCsrfToken },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("success=");

      const deleted = await getMenuScreenById(ms.id);
      expect(deleted).toBeNull();
    });

    test("redirects with error when menu screen not found", async () => {
      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/screen/${screenId}/menu/999/delete`,
          { csrf_token: userCsrfToken },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("error=");
    });

    test("returns 403 when user not assigned to business", async () => {
      const ms = await createMenuScreen("No Access", screenId, "grid-3x4", 20, 0);
      const otherUser = await createActivateAndLogin("other3", "user", "pass12345");
      globalThis.fetch = createMenuScreenMockFetch();

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/screen/${screenId}/menu/${ms.id}/delete`,
          { csrf_token: otherUser.csrfToken },
          otherUser.cookie,
        ),
      );
      expect(response.status).toBe(403);
    });

    test("returns 403 for invalid CSRF token", async () => {
      const ms = await createMenuScreen("CSRF Test", screenId, "grid-3x4", 20, 0);

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/screen/${screenId}/menu/${ms.id}/delete`,
          { csrf_token: "wrong-token" },
          userCookie,
        ),
      );
      expect(response.status).toBe(403);
    });

    test("handles layout already deleted in Xibo gracefully", async () => {
      const ms = await createMenuScreen("Deleted Layout", screenId, "grid-3x4", 20, 0);
      await updateMenuScreenLayoutId(ms.id, 999);

      globalThis.fetch = createMockFetch({
        "/api/layout/999": () => new Response("Not Found", { status: 404 }),
        "/api/campaign": (_url, init) => {
          if (init?.method === "DELETE") return new Response(null, { status: 204 });
          if (init?.method === "POST" && !_url.includes("/layout/assign")) {
            return jsonResponse({ campaignId: 50, campaign: "Screen", isLayoutSpecific: 0, totalDuration: 0 });
          }
          if (_url.includes("/layout/assign")) return jsonResponse({});
          return jsonResponse([]);
        },
        "/api/schedule": () => jsonResponse([]),
      });

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/screen/${screenId}/menu/${ms.id}/delete`,
          { csrf_token: userCsrfToken },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("success=");
    });
  });
});
