/**
 * Tests for dataset admin routes
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
import type { XiboDataset, XiboDatasetColumn } from "#xibo/types.ts";

const XIBO_URL = "https://xibo.test";

const sampleDatasets: XiboDataset[] = [
  {
    dataSetId: 1,
    dataSet: "Prices",
    description: "Product pricing",
    code: "prices",
    columnCount: 3,
    columns: [],
  },
  {
    dataSetId: 2,
    dataSet: "Inventory",
    description: "",
    code: "",
    columnCount: 2,
    columns: [],
  },
];

const sampleColumns: XiboDatasetColumn[] = [
  {
    dataSetColumnId: 1,
    heading: "Product",
    dataTypeId: 1,
    dataSetColumnTypeId: 1,
    listContent: "",
    columnOrder: 1,
  },
  {
    dataSetColumnId: 2,
    heading: "Price",
    dataTypeId: 2,
    dataSetColumnTypeId: 1,
    listContent: "",
    columnOrder: 2,
  },
];

const sampleRows = [
  { Product: "Burger", Price: 9.99 },
  { Product: "Fries", Price: 4.99 },
];

/** Original fetch for restore */
const originalFetch = globalThis.fetch;

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

describe("dataset routes", () => {
  let cookie: string;

  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
    await updateXiboCredentials(XIBO_URL, "test-id", "test-secret");
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

    test("renders dataset list with data", async () => {
      globalThis.fetch = createMockFetch({
        "/api/dataset": () => jsonResponse(sampleDatasets),
      });
      const response = await handleRequest(
        mockRequest("/admin/datasets", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Datasets");
      expect(html).toContain("Prices");
      expect(html).toContain("Inventory");
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
      await cacheInvalidateAll();
      globalThis.fetch = createMockFetch({
        "/api/dataset": () => new Response("Error", { status: 500 }),
      });
      const response = await handleRequest(
        mockRequest("/admin/datasets", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("API request failed");
    });
  });

  describe("GET /admin/dataset/:id", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handleRequest(mockRequest("/admin/dataset/1"));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("renders dataset detail with columns and data", async () => {
      globalThis.fetch = createMockFetch({
        "/api/dataset/data/1": () => jsonResponse(sampleRows),
        "/api/dataset/1/column": () => jsonResponse(sampleColumns),
        "/api/dataset": () => jsonResponse([sampleDatasets[0]]),
      });
      const response = await handleRequest(
        mockRequest("/admin/dataset/1", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Prices");
      expect(html).toContain("Product");
      expect(html).toContain("Price");
      expect(html).toContain("Burger");
      expect(html).toContain("9.99");
    });

    test("returns 404 for non-existent dataset", async () => {
      globalThis.fetch = createMockFetch({
        "/api/dataset": () => jsonResponse([]),
      });
      const response = await handleRequest(
        mockRequest("/admin/dataset/999", { headers: { cookie } }),
      );
      expect(response.status).toBe(404);
    });

    test("renders detail page even when columns and data fail", async () => {
      globalThis.fetch = createMockFetch({
        "/api/dataset/data/1": () =>
          new Response("Error", { status: 500 }),
        "/api/dataset/1/column": () =>
          new Response("Error", { status: 500 }),
        "/api/dataset": () => jsonResponse([sampleDatasets[0]]),
      });
      const response = await handleRequest(
        mockRequest("/admin/dataset/1", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Prices");
      expect(html).toContain("No columns defined");
      expect(html).toContain("No data rows");
    });
  });
});
