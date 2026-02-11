import { afterEach, beforeEach, describe, expect, it } from "#test-compat";
import { getAllActivityLog } from "#lib/db/activityLog.ts";
import { createBusiness } from "#lib/db/businesses.ts";
import {
  createScreen,
  deleteScreen,
  getAssignedDisplayIds,
  getScreenById,
  getScreensForBusiness,
  toDisplayScreen,
} from "#lib/db/screens.ts";
import { updateXiboCredentials } from "#lib/db/settings.ts";
import { clearToken } from "#xibo/client.ts";
import { cacheInvalidateAll } from "#xibo/cache.ts";
import {
  awaitTestRequest,
  createTestDbWithSetup,
  loginAsAdmin,
  mockFormRequest,
  mockRequest,
  resetDb,
} from "#test-utils";

const XIBO_URL = "https://xibo.test";

/** Original fetch for restore */
const originalFetch = globalThis.fetch;

/** JSON response helper */
const jsonResponse = (data: unknown): Response =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });

/**
 * Create a mock fetch that intercepts Xibo API calls.
 */
const createMockFetch = (
  handlers: Record<
    string,
    (url: string, init?: RequestInit) => Response | Promise<Response>
  >,
): typeof globalThis.fetch =>
  ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
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
      if (url.includes(pattern)) {
        return Promise.resolve(handler(url, init));
      }
    }

    return originalFetch(input, init);
  }) as typeof globalThis.fetch;

const handle = async (req: Request): Promise<Response> => {
  const { handleRequest } = await import("#routes");
  return handleRequest(req);
};

describe("admin screens management", () => {
  let cookie: string;
  let csrfToken: string;
  let businessId: number;

  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
    const login = await loginAsAdmin();
    cookie = login.cookie;
    csrfToken = login.csrfToken;
    // Create a business for screens to belong to
    const biz = await createBusiness("Test Business");
    businessId = biz.id;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearToken();
    resetDb();
  });

  describe("screens DB operations", () => {
    it("createScreen creates a screen with encrypted fields", async () => {
      const screen = await createScreen("Main Screen", businessId, 42);
      expect(screen.id).toBe(1);
      expect(screen.business_id).toBe(businessId);
      expect(screen.xibo_display_id).toBe(42);

      const display = await toDisplayScreen(screen);
      expect(display.name).toBe("Main Screen");
      expect(display.created_at).toContain("T");
    });

    it("createScreen works with null display id", async () => {
      const screen = await createScreen("No Display", businessId, null);
      expect(screen.xibo_display_id).toBeNull();
    });

    it("getScreenById returns null for nonexistent", async () => {
      const result = await getScreenById(999);
      expect(result).toBeNull();
    });

    it("getScreensForBusiness returns screens for a business", async () => {
      await createScreen("Screen A", businessId, null);
      await createScreen("Screen B", businessId, null);
      const screens = await getScreensForBusiness(businessId);
      expect(screens.length).toBe(2);
    });

    it("getScreensForBusiness returns empty for business with no screens", async () => {
      const screens = await getScreensForBusiness(businessId);
      expect(screens.length).toBe(0);
    });

    it("deleteScreen cascades to menu_screens", async () => {
      const screen = await createScreen("To Delete", businessId, null);
      // Add a menu_screen for this screen
      const { encrypt } = await import("#lib/crypto.ts");
      const { getDb } = await import("#lib/db/client.ts");
      await getDb().execute({
        sql: "INSERT INTO menu_screens (name, screen_id, template_id, display_time, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: [await encrypt("Menu 1"), screen.id, "template-1", 10, 1, await encrypt(new Date().toISOString())],
      });

      await deleteScreen(screen.id);
      expect(await getScreenById(screen.id)).toBeNull();

      // Verify menu_screens deleted
      const db = await import("#lib/db/client.ts");
      const result = await db.getDb().execute({
        sql: "SELECT COUNT(*) as count FROM menu_screens WHERE screen_id = ?",
        args: [screen.id],
      });
      expect(Number(result.rows[0]!.count)).toBe(0);
    });

    it("getAssignedDisplayIds returns assigned display IDs", async () => {
      await createScreen("S1", businessId, 10);
      await createScreen("S2", businessId, 20);
      await createScreen("S3", businessId, null);
      const ids = await getAssignedDisplayIds();
      expect(ids.length).toBe(2);
      expect(ids).toContain(10);
      expect(ids).toContain(20);
    });
  });

  describe("GET /admin/business/:id/screen/create", () => {
    it("shows screen create form", async () => {
      const response = await awaitTestRequest(
        `/admin/business/${businessId}/screen/create`,
        { cookie },
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Add Screen");
      expect(html).toContain("Test Business");
    });

    it("returns 404 for nonexistent business", async () => {
      const response = await awaitTestRequest(
        "/admin/business/999/screen/create",
        { cookie },
      );
      expect(response.status).toBe(404);
    });

    it("redirects when not authenticated", async () => {
      const response = await handle(
        mockRequest(`/admin/business/${businessId}/screen/create`),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });
  });

  describe("POST /admin/business/:id/screen/create", () => {
    it("creates a screen and redirects", async () => {
      const response = await handle(
        mockFormRequest(
          `/admin/business/${businessId}/screen/create`,
          { name: "New Screen", csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location")!;
      expect(decodeURIComponent(location)).toContain("Screen created");

      const screens = await getScreensForBusiness(businessId);
      expect(screens.length).toBe(1);
    });

    it("creates a screen with xibo display id", async () => {
      await handle(
        mockFormRequest(
          `/admin/business/${businessId}/screen/create`,
          { name: "Display Screen", xibo_display_id: "42", csrf_token: csrfToken },
          cookie,
        ),
      );
      const screens = await getScreensForBusiness(businessId);
      expect(screens[0]!.xibo_display_id).toBe(42);
    });

    it("rejects missing name", async () => {
      const response = await handle(
        mockFormRequest(
          `/admin/business/${businessId}/screen/create`,
          { name: "", csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(400);
    });

    it("returns 404 for nonexistent business", async () => {
      const response = await handle(
        mockFormRequest(
          "/admin/business/999/screen/create",
          { name: "Test", csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(404);
    });

    it("logs activity on screen creation", async () => {
      await handle(
        mockFormRequest(
          `/admin/business/${businessId}/screen/create`,
          { name: "Audit Screen", csrf_token: csrfToken },
          cookie,
        ),
      );
      const logs = await getAllActivityLog();
      const log = logs.find((l) => l.message.includes("Created screen"));
      expect(log).not.toBeNull();
      expect(log!.message).toContain("Audit Screen");
    });
  });

  describe("GET /admin/business/:businessId/screen/:id", () => {
    it("shows screen detail page", async () => {
      const screen = await createScreen("Detail Screen", businessId, 42);
      const response = await awaitTestRequest(
        `/admin/business/${businessId}/screen/${screen.id}`,
        { cookie },
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Detail Screen");
      expect(html).toContain("42");
    });

    it("returns 404 for nonexistent screen", async () => {
      const response = await awaitTestRequest(
        `/admin/business/${businessId}/screen/999`,
        { cookie },
      );
      expect(response.status).toBe(404);
    });

    it("returns 404 for nonexistent business", async () => {
      const screen = await createScreen("Orphan", businessId, null);
      const response = await awaitTestRequest(
        `/admin/business/999/screen/${screen.id}`,
        { cookie },
      );
      expect(response.status).toBe(404);
    });

    it("returns 404 when screen does not belong to business", async () => {
      const otherBiz = await createBusiness("Other Biz");
      const screen = await createScreen("Wrong Biz", otherBiz.id, null);
      const response = await awaitTestRequest(
        `/admin/business/${businessId}/screen/${screen.id}`,
        { cookie },
      );
      expect(response.status).toBe(404);
    });
  });

  describe("POST /admin/business/:businessId/screen/:id/delete", () => {
    it("deletes screen and redirects", async () => {
      const screen = await createScreen("Delete Screen", businessId, null);
      const response = await handle(
        mockFormRequest(
          `/admin/business/${businessId}/screen/${screen.id}/delete`,
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location")!;
      expect(decodeURIComponent(location)).toContain("Screen deleted");

      expect(await getScreenById(screen.id)).toBeNull();
    });

    it("returns 404 for nonexistent screen", async () => {
      const response = await handle(
        mockFormRequest(
          `/admin/business/${businessId}/screen/999/delete`,
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(404);
    });

    it("returns 404 when screen does not belong to business", async () => {
      const otherBiz = await createBusiness("Other Delete");
      const screen = await createScreen("Wrong Delete", otherBiz.id, null);
      const response = await handle(
        mockFormRequest(
          `/admin/business/${businessId}/screen/${screen.id}/delete`,
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(404);
    });

    it("returns 404 for nonexistent business", async () => {
      const screen = await createScreen("Orphan Delete", businessId, null);
      const response = await handle(
        mockFormRequest(
          `/admin/business/999/screen/${screen.id}/delete`,
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(404);
    });

    it("logs activity on screen deletion", async () => {
      const screen = await createScreen("Log Delete Screen", businessId, null);
      await handle(
        mockFormRequest(
          `/admin/business/${businessId}/screen/${screen.id}/delete`,
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      const logs = await getAllActivityLog();
      const log = logs.find((l) => l.message.includes("Deleted screen"));
      expect(log).not.toBeNull();
    });
  });

  describe("screen detail with success message", () => {
    it("shows success message from query param", async () => {
      const screen = await createScreen("Success Screen", businessId, null);
      const response = await awaitTestRequest(
        `/admin/business/${businessId}/screen/${screen.id}?success=Updated+successfully`,
        { cookie },
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Updated successfully");
      expect(html).toContain('class="success"');
    });
  });

  describe("screen create with Xibo displays", () => {
    it("shows available Xibo displays when config exists", async () => {
      await updateXiboCredentials(XIBO_URL, "test-id", "test-secret");
      clearToken();
      await cacheInvalidateAll();

      const sampleDisplays = [
        { displayId: 100, display: "Lobby Display", description: "", licensed: 1, defaultLayoutId: 1 },
        { displayId: 200, display: "Kitchen Display", description: "", licensed: 1, defaultLayoutId: 1 },
      ];

      globalThis.fetch = createMockFetch({
        "/api/display": () => jsonResponse(sampleDisplays),
      });

      const response = await awaitTestRequest(
        `/admin/business/${businessId}/screen/create`,
        { cookie },
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Lobby Display");
      expect(html).toContain("Kitchen Display");
      expect(html).toContain("100");
      expect(html).toContain("200");
    });

    it("filters out already-assigned displays", async () => {
      await updateXiboCredentials(XIBO_URL, "test-id", "test-secret");
      clearToken();
      await cacheInvalidateAll();

      // Assign display 100 to an existing screen
      await createScreen("Existing", businessId, 100);

      const sampleDisplays = [
        { displayId: 100, display: "Assigned Display", description: "", licensed: 1, defaultLayoutId: 1 },
        { displayId: 200, display: "Free Display", description: "", licensed: 1, defaultLayoutId: 1 },
      ];

      globalThis.fetch = createMockFetch({
        "/api/display": () => jsonResponse(sampleDisplays),
      });

      const response = await awaitTestRequest(
        `/admin/business/${businessId}/screen/create`,
        { cookie },
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).not.toContain("Assigned Display");
      expect(html).toContain("Free Display");
    });

    it("shows error when Xibo API fails", async () => {
      await updateXiboCredentials(XIBO_URL, "test-id", "test-secret");
      clearToken();
      await cacheInvalidateAll();

      globalThis.fetch = createMockFetch({
        "/api/display": () =>
          new Response("Internal Server Error", { status: 500 }),
      });

      const response = await awaitTestRequest(
        `/admin/business/${businessId}/screen/create`,
        { cookie },
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      // Form should still render even with fetch error
      expect(html).toContain("Add Screen");
    });
  });
});
