/**
 * Tests for user product management routes (/dashboard/business/:id/product*)
 *
 * Tests product CRUD via mocked Xibo dataset API, access control,
 * and availability toggling.
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
import {
  setSharedFolderId,
  updateXiboCredentials,
} from "#lib/db/settings.ts";
import { clearToken } from "#xibo/client.ts";
import { cacheInvalidateAll } from "#xibo/cache.ts";
import type { XiboMedia } from "#xibo/types.ts";
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
const SHARED_FOLDER_ID = 42;
const BUSINESS_FOLDER_ID = 100;

const sampleProducts = [
  { id: 1, name: "Vanilla", price: "3.50", media_id: null, available: 1, sort_order: 0 },
  { id: 2, name: "Chocolate", price: "4.00", media_id: 10, available: 0, sort_order: 1 },
];

const sampleMedia: XiboMedia[] = [
  {
    mediaId: 10,
    name: "ice-cream.jpg",
    mediaType: "image",
    storedAs: "10.jpg",
    fileSize: 102400,
    duration: 10,
    tags: "",
    folderId: BUSINESS_FOLDER_ID,
  },
  {
    mediaId: 20,
    name: "shared-bg.png",
    mediaType: "image",
    storedAs: "20.png",
    fileSize: 204800,
    duration: 10,
    tags: "",
    folderId: SHARED_FOLDER_ID,
  },
  {
    mediaId: 30,
    name: "video.mp4",
    mediaType: "video",
    storedAs: "30.mp4",
    fileSize: 1024000,
    duration: 60,
    tags: "",
    folderId: BUSINESS_FOLDER_ID,
  },
];

describe("user product routes", () => {
  let userCookie: string;
  let userCsrfToken: string;
  let userId: number;
  let businessId: number;

  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
    await updateXiboCredentials(XIBO_URL, "test-id", "test-secret");
    await setSharedFolderId(SHARED_FOLDER_ID);
    clearToken();
    await cacheInvalidateAll();

    const biz = await createBusiness("Test Business");
    businessId = biz.id;
    await updateBusinessXiboIds(businessId, BUSINESS_FOLDER_ID, "test-biz-abc", DATASET_ID);

    const user = await createActivateAndLogin("produser", "user", "userpass123");
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

  describe("GET /dashboard/business/:id/products", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/products`),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("shows product list for assigned business", async () => {
      globalThis.fetch = createMockFetch({
        [`/api/dataset/data/${DATASET_ID}`]: () => jsonResponse(sampleProducts),
      });

      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/products`, {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Vanilla");
      expect(html).toContain("Chocolate");
      expect(html).toContain("3.50");
      expect(html).toContain("4.00");
    });

    test("shows empty state when no products", async () => {
      globalThis.fetch = createMockFetch({
        [`/api/dataset/data/${DATASET_ID}`]: () => jsonResponse([]),
      });

      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/products`, {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("No products yet");
    });

    test("returns 403 when user is not assigned to business", async () => {
      // User must belong to SOME business to pass the outer HOF check
      const otherBiz = await createBusiness("Other Biz");
      const otherUser = await createActivateAndLogin("other", "user", "pass12345");
      await assignUserToBusiness(otherBiz.id, otherUser.userId);
      globalThis.fetch = createMockFetch({});

      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/products`, {
          headers: { cookie: otherUser.cookie },
        }),
      );
      expect(response.status).toBe(403);
      const html = await response.text();
      expect(html).toContain("Access Denied");
    });

    test("shows error when dataset not provisioned", async () => {
      const biz2 = await createBusiness("No Dataset Biz");
      await assignUserToBusiness(biz2.id, userId);
      globalThis.fetch = createMockFetch({});

      const response = await handle(
        mockRequest(`/dashboard/business/${biz2.id}/products`, {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("dataset not provisioned");
    });

    test("shows error when API fails", async () => {
      globalThis.fetch = createMockFetch({
        [`/api/dataset/data/${DATASET_ID}`]: () =>
          new Response("Server Error", { status: 500 }),
      });

      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/products`, {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Failed to load products");
    });

    test("shows success message from query param", async () => {
      globalThis.fetch = createMockFetch({
        [`/api/dataset/data/${DATASET_ID}`]: () => jsonResponse([]),
      });

      const response = await handle(
        mockRequest(
          `/dashboard/business/${businessId}/products?success=Product+added`,
          { headers: { cookie: userCookie } },
        ),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Product added");
    });

    test("shows availability toggle buttons", async () => {
      globalThis.fetch = createMockFetch({
        [`/api/dataset/data/${DATASET_ID}`]: () => jsonResponse(sampleProducts),
      });

      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/products`, {
          headers: { cookie: userCookie },
        }),
      );
      const html = await response.text();
      expect(html).toContain("Disable");
      expect(html).toContain("Enable");
    });
  });

  describe("GET /dashboard/business/:id/product/create", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/product/create`),
      );
      expect(response.status).toBe(302);
    });

    test("renders create form with image picker", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": () => jsonResponse(sampleMedia),
      });

      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/product/create`, {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Add Product");
      expect(html).toContain("ice-cream.jpg");
      expect(html).toContain("shared-bg.png");
      // Video should not appear in image picker
      expect(html).not.toContain("video.mp4");
    });

    test("renders create form with empty media when media API fails", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": () => new Response("Error", { status: 500 }),
      });

      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/product/create`, {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Add Product");
      expect(html).not.toContain("ice-cream.jpg");
    });

    test("returns 403 when user not assigned", async () => {
      const otherBiz = await createBusiness("Other Biz2");
      const otherUser = await createActivateAndLogin("other2", "user", "pass12345");
      await assignUserToBusiness(otherBiz.id, otherUser.userId);
      globalThis.fetch = createMockFetch({});

      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/product/create`, {
          headers: { cookie: otherUser.cookie },
        }),
      );
      expect(response.status).toBe(403);
    });
  });

  describe("POST /dashboard/business/:id/product/create", () => {
    test("creates product and redirects", async () => {
      let capturedBody: Record<string, unknown> | null = null;
      globalThis.fetch = createMockFetch({
        [`/api/dataset/data/${DATASET_ID}`]: (_url, init) => {
          if (init?.method === "POST") {
            capturedBody = JSON.parse(init.body as string);
            return jsonResponse({ id: 3 });
          }
          return jsonResponse([]);
        },
      });

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/product/create`,
          { csrf_token: userCsrfToken, name: "Strawberry", price: "4.50" },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("success=");
      expect(capturedBody).not.toBeNull();
      expect(capturedBody!.name).toBe("Strawberry");
      expect(capturedBody!.price).toBe("4.50");
    });

    test("returns 400 when name is missing", async () => {
      globalThis.fetch = createMockFetch({});

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/product/create`,
          { csrf_token: userCsrfToken, price: "4.50" },
          userCookie,
        ),
      );
      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("Name is required");
    });

    test("returns 400 when price is missing", async () => {
      globalThis.fetch = createMockFetch({});

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/product/create`,
          { csrf_token: userCsrfToken, name: "Strawberry" },
          userCookie,
        ),
      );
      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("Price is required");
    });

    test("returns 403 when user not assigned to business", async () => {
      const otherUser = await createActivateAndLogin("other3", "user", "pass12345");
      globalThis.fetch = createMockFetch({});

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/product/create`,
          { csrf_token: otherUser.csrfToken, name: "Test", price: "1.00" },
          otherUser.cookie,
        ),
      );
      expect(response.status).toBe(403);
    });

    test("redirects with error when dataset not provisioned", async () => {
      const biz2 = await createBusiness("No Dataset");
      await assignUserToBusiness(biz2.id, userId);
      globalThis.fetch = createMockFetch({});

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${biz2.id}/product/create`,
          { csrf_token: userCsrfToken, name: "Test", price: "1.00" },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location") || "";
      expect(location).toContain("error=");
    });

    test("redirects with error when API fails", async () => {
      globalThis.fetch = createMockFetch({
        [`/api/dataset/data/${DATASET_ID}`]: () =>
          new Response("Error", { status: 500 }),
      });

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/product/create`,
          { csrf_token: userCsrfToken, name: "Strawberry", price: "4.50" },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("error=");
    });

    test("returns 403 for invalid CSRF token", async () => {
      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/product/create`,
          { csrf_token: "wrong-token", name: "Test", price: "1.00" },
          userCookie,
        ),
      );
      expect(response.status).toBe(403);
    });
  });

  describe("GET /dashboard/business/:id/product/:rowId", () => {
    test("renders edit form with product data", async () => {
      globalThis.fetch = createMockFetch({
        [`/api/dataset/data/${DATASET_ID}`]: () => jsonResponse(sampleProducts),
        "/api/library": () => jsonResponse(sampleMedia),
      });

      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/product/1`, {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Edit Vanilla");
      expect(html).toContain("3.50");
    });

    test("redirects with error for non-existent product", async () => {
      globalThis.fetch = createMockFetch({
        [`/api/dataset/data/${DATASET_ID}`]: () => jsonResponse(sampleProducts),
      });

      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/product/999`, {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("error=");
      expect(response.headers.get("location")).toContain("not%20found");
    });

    test("redirects with error when product API fails", async () => {
      globalThis.fetch = createMockFetch({
        [`/api/dataset/data/${DATASET_ID}`]: () =>
          new Response("Server Error", { status: 500 }),
      });

      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/product/1`, {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("error=");
    });

    test("returns 403 when user not assigned", async () => {
      const otherBiz = await createBusiness("Other Biz4");
      const otherUser = await createActivateAndLogin("other4", "user", "pass12345");
      await assignUserToBusiness(otherBiz.id, otherUser.userId);
      globalThis.fetch = createMockFetch({});

      const response = await handle(
        mockRequest(`/dashboard/business/${businessId}/product/1`, {
          headers: { cookie: otherUser.cookie },
        }),
      );
      expect(response.status).toBe(403);
    });
  });

  describe("POST /dashboard/business/:id/product/:rowId", () => {
    test("updates product and redirects", async () => {
      let capturedBody: Record<string, unknown> | null = null;
      globalThis.fetch = createMockFetch({
        [`/api/dataset/data/${DATASET_ID}/1`]: (_url, init) => {
          if (init?.method === "PUT") {
            capturedBody = JSON.parse(init.body as string);
            return jsonResponse({ id: 1 });
          }
          return jsonResponse(sampleProducts);
        },
      });

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/product/1`,
          { csrf_token: userCsrfToken, name: "Vanilla Bean", price: "3.75" },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("success=");
      expect(capturedBody).not.toBeNull();
      expect(capturedBody!.name).toBe("Vanilla Bean");
      expect(capturedBody!.price).toBe("3.75");
    });

    test("returns 400 when validation fails", async () => {
      globalThis.fetch = createMockFetch({});

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/product/1`,
          { csrf_token: userCsrfToken, name: "", price: "3.75" },
          userCookie,
        ),
      );
      expect(response.status).toBe(400);
    });

    test("redirects with error when API fails", async () => {
      globalThis.fetch = createMockFetch({
        [`/api/dataset/data/${DATASET_ID}/1`]: () =>
          new Response("Error", { status: 500 }),
      });

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/product/1`,
          { csrf_token: userCsrfToken, name: "Vanilla", price: "3.50" },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("error=");
    });
  });

  describe("POST /dashboard/business/:id/product/:rowId/delete", () => {
    test("deletes product and redirects", async () => {
      let deleteWasCalled = false;
      globalThis.fetch = createMockFetch({
        [`/api/dataset/data/${DATASET_ID}/1`]: (_url, init) => {
          if (init?.method === "DELETE") {
            deleteWasCalled = true;
            return new Response(null, { status: 204 });
          }
          return jsonResponse(sampleProducts);
        },
      });

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/product/1/delete`,
          { csrf_token: userCsrfToken },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("success=");
      expect(deleteWasCalled).toBe(true);
    });

    test("returns 403 when user not assigned", async () => {
      const otherUser = await createActivateAndLogin("other5", "user", "pass12345");
      globalThis.fetch = createMockFetch({});

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/product/1/delete`,
          { csrf_token: otherUser.csrfToken },
          otherUser.cookie,
        ),
      );
      expect(response.status).toBe(403);
    });

    test("redirects with error when delete fails", async () => {
      globalThis.fetch = createMockFetch({
        [`/api/dataset/data/${DATASET_ID}/1`]: () =>
          new Response("Error", { status: 500 }),
      });

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/product/1/delete`,
          { csrf_token: userCsrfToken },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("error=");
    });

    test("redirects with error when dataset not provisioned", async () => {
      const biz2 = await createBusiness("No Dataset");
      await assignUserToBusiness(biz2.id, userId);
      globalThis.fetch = createMockFetch({});

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${biz2.id}/product/1/delete`,
          { csrf_token: userCsrfToken },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("error=");
    });
  });

  describe("POST /dashboard/business/:id/product/:rowId/toggle", () => {
    test("toggles available product to disabled", async () => {
      let capturedBody: Record<string, unknown> | null = null;
      globalThis.fetch = createMockFetch({
        [`/api/dataset/data/${DATASET_ID}/1`]: (_url, init) => {
          if (init?.method === "PUT") {
            capturedBody = JSON.parse(init.body as string);
            return jsonResponse({ id: 1 });
          }
          return jsonResponse(sampleProducts);
        },
        [`/api/dataset/data/${DATASET_ID}`]: () => jsonResponse(sampleProducts),
      });

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/product/1/toggle`,
          { csrf_token: userCsrfToken },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("success=");
      expect(response.headers.get("location")).toContain("disabled");
      expect(capturedBody).not.toBeNull();
      expect(capturedBody!.available).toBe(0);
    });

    test("toggles disabled product to enabled", async () => {
      let capturedBody: Record<string, unknown> | null = null;
      globalThis.fetch = createMockFetch({
        [`/api/dataset/data/${DATASET_ID}/2`]: (_url, init) => {
          if (init?.method === "PUT") {
            capturedBody = JSON.parse(init.body as string);
            return jsonResponse({ id: 2 });
          }
          return jsonResponse(sampleProducts);
        },
        [`/api/dataset/data/${DATASET_ID}`]: () => jsonResponse(sampleProducts),
      });

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/product/2/toggle`,
          { csrf_token: userCsrfToken },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("success=");
      expect(response.headers.get("location")).toContain("enabled");
      expect(capturedBody).not.toBeNull();
      expect(capturedBody!.available).toBe(1);
    });

    test("redirects with error when product not found", async () => {
      globalThis.fetch = createMockFetch({
        [`/api/dataset/data/${DATASET_ID}`]: () => jsonResponse(sampleProducts),
      });

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/product/999/toggle`,
          { csrf_token: userCsrfToken },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("error=");
      expect(response.headers.get("location")).toContain("not%20found");
    });

    test("returns 403 when user not assigned", async () => {
      const otherUser = await createActivateAndLogin("other6", "user", "pass12345");
      globalThis.fetch = createMockFetch({});

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/product/1/toggle`,
          { csrf_token: otherUser.csrfToken },
          otherUser.cookie,
        ),
      );
      expect(response.status).toBe(403);
    });

    test("redirects with error when dataset not provisioned", async () => {
      const biz2 = await createBusiness("No Dataset");
      await assignUserToBusiness(biz2.id, userId);
      globalThis.fetch = createMockFetch({});

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${biz2.id}/product/1/toggle`,
          { csrf_token: userCsrfToken },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("error=");
    });

    test("redirects with error when fetch fails", async () => {
      globalThis.fetch = createMockFetch({
        [`/api/dataset/data/${DATASET_ID}`]: () =>
          new Response("Error", { status: 500 }),
      });

      const response = await handle(
        mockFormRequest(
          `/dashboard/business/${businessId}/product/1/toggle`,
          { csrf_token: userCsrfToken },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("error=");
    });
  });
});
