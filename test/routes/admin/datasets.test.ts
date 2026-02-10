/**
 * Tests for dataset admin routes
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
  mockRequest,
  resetDb,
} from "#test-utils";
import {
  invalidateSettingsCache,
  updateXiboCredentials,
} from "#lib/db/settings.ts";
import { clearToken } from "#xibo/client.ts";
import { cacheInvalidateAll } from "#xibo/cache.ts";
import type { XiboDataset } from "#xibo/types.ts";

const XIBO_URL = "https://xibo.test";
const XIBO_CLIENT_ID = "test-client-id";
const XIBO_CLIENT_SECRET = "test-client-secret";

const sampleDatasets: XiboDataset[] = [
  {
    dataSetId: 1,
    dataSet: "Menu Items",
    description: "Main menu items dataset",
    code: "MENU",
    columns: [],
    rows: [],
  },
  {
    dataSetId: 2,
    dataSet: "Specials",
    description: "",
    code: "",
    columns: [],
    rows: [],
  },
];

const sampleColumns = [
  { dataSetColumnId: 1, heading: "Item", dataTypeId: 1, columnOrder: 1 },
  { dataSetColumnId: 2, heading: "Price", dataTypeId: 1, columnOrder: 2 },
  { dataSetColumnId: 3, heading: "Calculated", dataTypeId: 2, columnOrder: 3 },
];

const sampleData = [
  { Item: "Burger", Price: "9.99", Calculated: "10.99" },
  { Item: "Fries", Price: "4.99", Calculated: "5.49" },
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

describe("dataset routes", () => {
  let cookie: string;

  beforeEach(async () => {
    await createTestDbWithSetup();
    await updateXiboCredentials(XIBO_URL, XIBO_CLIENT_ID, XIBO_CLIENT_SECRET);
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

  /** Clear Xibo credentials */
  const clearXiboConfig = async (): Promise<void> => {
    await updateXiboCredentials("", "", "");
    invalidateSettingsCache();
    await cacheInvalidateAll();
  };

  describe("GET /admin/datasets", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handleRequest(mockRequest("/admin/datasets"));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("redirects to settings when Xibo not configured", async () => {
      await clearXiboConfig();

      const response = await handleRequest(
        mockRequest("/admin/datasets", { headers: { cookie } }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("/admin/settings");
    });

    test("renders dataset list page with data", async () => {
      globalThis.fetch = createMockFetch({
        "/api/dataset": () => jsonResponse(sampleDatasets),
      });

      const response = await handleRequest(
        mockRequest("/admin/datasets", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Datasets");
      expect(html).toContain("Menu Items");
      expect(html).toContain("Specials");
      expect(html).toContain("MENU");
    });

    test("renders empty dataset list", async () => {
      globalThis.fetch = createMockFetch({
        "/api/dataset": () => jsonResponse([]),
      });

      const response = await handleRequest(
        mockRequest("/admin/datasets", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("No datasets found");
    });

    test("shows error when API fails", async () => {
      globalThis.fetch = createMockFetch({
        "/api/dataset": () => new Response("Server Error", { status: 500 }),
      });

      const response = await handleRequest(
        mockRequest("/admin/datasets", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("API request failed");
    });

    test("renders with success query param", async () => {
      globalThis.fetch = createMockFetch({
        "/api/dataset": () => jsonResponse([]),
      });

      const response = await handleRequest(
        mockRequest("/admin/datasets?success=Done", {
          headers: { cookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Done");
    });
  });

  describe("GET /admin/dataset/:id", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handleRequest(mockRequest("/admin/dataset/1"));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("renders dataset detail page with columns and data", async () => {
      globalThis.fetch = createMockFetch({
        "/api/dataset/data/1": () => jsonResponse(sampleData),
        "/api/dataset/1/column": () => jsonResponse(sampleColumns),
        "/api/dataset": () => jsonResponse([sampleDatasets[0]]),
      });

      const response = await handleRequest(
        mockRequest("/admin/dataset/1", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Menu Items");
      expect(html).toContain("Item");
      expect(html).toContain("Price");
      expect(html).toContain("Burger");
      expect(html).toContain("9.99");
      expect(html).toContain("Value");
      expect(html).toContain("Formula");
    });

    test("returns 404 when dataset not found", async () => {
      globalThis.fetch = createMockFetch({
        "/api/dataset": () => jsonResponse([]),
      });

      const response = await handleRequest(
        mockRequest("/admin/dataset/999", { headers: { cookie } }),
      );
      expect(response.status).toBe(404);
    });

    test("renders detail page when columns fetch fails", async () => {
      globalThis.fetch = createMockFetch({
        "/api/dataset/1/column": () =>
          new Response("Error", { status: 500 }),
        "/api/dataset/data/1": () => jsonResponse([]),
        "/api/dataset": () => jsonResponse([sampleDatasets[0]]),
      });

      const response = await handleRequest(
        mockRequest("/admin/dataset/1", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Menu Items");
      expect(html).toContain("No columns defined");
    });

    test("renders detail page when data fetch fails", async () => {
      globalThis.fetch = createMockFetch({
        "/api/dataset/1/column": () => jsonResponse(sampleColumns),
        "/api/dataset/data/1": () =>
          new Response("Error", { status: 500 }),
        "/api/dataset": () => jsonResponse([sampleDatasets[0]]),
      });

      const response = await handleRequest(
        mockRequest("/admin/dataset/1", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Menu Items");
      expect(html).toContain("No data rows");
    });
  });
});
