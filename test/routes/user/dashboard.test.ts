/**
 * Tests for user dashboard routes (/dashboard, /dashboard/business/:id)
 *
 * Tests that users see their assigned businesses and per-business overviews.
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
import { updateXiboCredentials } from "#lib/db/settings.ts";
import { clearToken } from "#xibo/client.ts";
import { cacheInvalidateAll } from "#xibo/cache.ts";
import {
  createActivateAndLogin,
  createMockFetch,
  createTestDbWithSetup,
  handle,
  jsonResponse,
  mockRequest,
  resetDb,
  restoreFetch,
} from "#test-utils";

const XIBO_URL = "https://xibo.test";
const XIBO_CLIENT_ID = "test-client-id";
const XIBO_CLIENT_SECRET = "test-client-secret";

describe("user dashboard routes", () => {
  let userCookie: string;
  let userId: number;
  let businessId: number;

  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
    await updateXiboCredentials(XIBO_URL, XIBO_CLIENT_ID, XIBO_CLIENT_SECRET);
    clearToken();
    await cacheInvalidateAll();

    // Create a business with Xibo dataset
    const biz = await createBusiness("Test Business");
    businessId = biz.id;
    await updateBusinessXiboIds(businessId, 100, "test-biz-abc123", 500);

    // Create a user and assign to business
    const user = await createActivateAndLogin("dashuser", "user", "userpass123");
    userCookie = user.cookie;
    userId = user.userId;
    await assignUserToBusiness(businessId, userId);
  });

  afterEach(() => {
    restoreFetch();
    clearToken();
    resetDb();
  });

  describe("GET /dashboard", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handle(mockRequest("/dashboard"));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("shows businesses the user belongs to", async () => {
      globalThis.fetch = createMockFetch({});

      const response = await handle(
        mockRequest("/dashboard", {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Dashboard");
      expect(html).toContain("Test Business");
      expect(html).toContain(`/dashboard/business/${businessId}`);
    });

    test("shows message when user has no businesses", async () => {
      const noBusinessUser = await createActivateAndLogin(
        "nobiz",
        "user",
        "userpass123",
      );

      globalThis.fetch = createMockFetch({});

      const response = await handle(
        mockRequest("/dashboard", {
          headers: { cookie: noBusinessUser.cookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("not assigned to any businesses");
    });

    test("shows multiple businesses", async () => {
      const biz2 = await createBusiness("Second Business");
      await assignUserToBusiness(biz2.id, userId);

      globalThis.fetch = createMockFetch({});

      const response = await handle(
        mockRequest("/dashboard", {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Test Business");
      expect(html).toContain("Second Business");
    });
  });

  describe("GET /dashboard/business/:id", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}`),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("shows business overview with screen and product counts", async () => {
      globalThis.fetch = createMockFetch({
        "/api/dataset/data/500": () =>
          jsonResponse([
            { id: 1, name: "Vanilla", price: "3.50", media_id: null, available: 1, sort_order: 0 },
            { id: 2, name: "Chocolate", price: "3.50", media_id: null, available: 1, sort_order: 1 },
          ]),
      });

      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}`, {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Test Business");
      expect(html).toContain("Manage Products");
      expect(html).toContain("Manage Media");
    });

    test("returns 403 when user is not assigned to business", async () => {
      // Create user assigned to a DIFFERENT business (so they pass the outer business context check)
      const otherBiz = await createBusiness("Other Business");
      await updateBusinessXiboIds(otherBiz.id, 200, "other-biz-xyz", 501);
      const otherUser = await createActivateAndLogin(
        "otheruser",
        "user",
        "userpass123",
      );
      await assignUserToBusiness(otherBiz.id, otherUser.userId);

      globalThis.fetch = createMockFetch({});

      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}`, {
          headers: { cookie: otherUser.cookie },
        }),
      );
      expect(response.status).toBe(403);
      const html = await response.text();
      expect(html).toContain("Access Denied");
    });

    test("returns 404 for non-existent business", async () => {
      globalThis.fetch = createMockFetch({});

      const response = await handle(
        mockRequest("/dashboard/business/9999", {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(404);
      const html = await response.text();
      expect(html).toContain("Business not found");
    });

    test("shows zero product count when dataset not provisioned", async () => {
      const biz2 = await createBusiness("No Dataset Biz");
      await assignUserToBusiness(biz2.id, userId);

      globalThis.fetch = createMockFetch({});

      const response = await handle(
        mockRequest(`/dashboard/business/${biz2.id}`, {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("No Dataset Biz");
    });

    test("handles dataset API error gracefully", async () => {
      globalThis.fetch = createMockFetch({
        "/api/dataset/data/500": () =>
          new Response("Server Error", { status: 500 }),
      });

      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}`, {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Test Business");
    });

    test("shows success message from query param", async () => {
      globalThis.fetch = createMockFetch({
        "/api/dataset/data/500": () => jsonResponse([]),
      });

      const response = await handle(
        mockRequest(
          `/dashboard/business/${businessId}?success=Product+added`,
          { headers: { cookie: userCookie } },
        ),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Product added");
    });
  });
});
