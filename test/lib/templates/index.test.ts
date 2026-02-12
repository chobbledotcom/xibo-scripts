/**
 * Tests for layout template registry
 *
 * Verifies template lookup, constants, and layout building with mocked Xibo API.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "#test-compat";
import {
  buildLayoutFromTemplate,
  getTemplateById,
  rebuildLayout,
  TEMPLATES,
} from "#lib/templates/index.ts";
import type { TemplateProduct } from "#lib/templates/index.ts";
import { clearToken } from "#xibo/client.ts";
import { cacheInvalidateAll } from "#xibo/cache.ts";
import {
  createMockFetch,
  createTestDbWithSetup,
  jsonResponse,
  resetDb,
  restoreFetch,
} from "#test-utils";
import { updateXiboCredentials } from "#lib/db/settings.ts";

const XIBO_URL = "https://xibo.test";

describe("layout template registry", () => {
  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
    await updateXiboCredentials(XIBO_URL, "test-id", "test-secret");
    clearToken();
    await cacheInvalidateAll();
  });

  afterEach(() => {
    restoreFetch();
    clearToken();
    resetDb();
  });

  describe("TEMPLATES", () => {
    test("has at least two templates", () => {
      expect(TEMPLATES.length).toBeGreaterThanOrEqual(2);
    });

    test("each template has required fields", () => {
      for (const t of TEMPLATES) {
        expect(t.id).toBeTruthy();
        expect(t.name).toBeTruthy();
        expect(t.maxProducts).toBeGreaterThan(0);
        expect(t.description).toBeTruthy();
      }
    });

    test("template IDs are unique", () => {
      const ids = TEMPLATES.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("getTemplateById", () => {
    test("returns template when found", () => {
      const t = getTemplateById("grid-3x4");
      expect(t).not.toBeNull();
      expect(t!.id).toBe("grid-3x4");
      expect(t!.name).toBe("3x4 Grid");
      expect(t!.maxProducts).toBe(12);
    });

    test("returns undefined for unknown template", () => {
      const t = getTemplateById("nonexistent");
      expect(t).toBeUndefined();
    });

    test("returns list-6 template", () => {
      const t = getTemplateById("list-6");
      expect(t).not.toBeNull();
      expect(t!.name).toBe("Simple List");
      expect(t!.maxProducts).toBe(6);
    });
  });

  describe("buildLayoutFromTemplate", () => {
    const sampleProducts: TemplateProduct[] = [
      { name: "Vanilla", price: "3.50" },
      { name: "Chocolate", price: "4.00" },
    ];

    test("builds layout with grid-3x4 template", async () => {
      let layoutCreated = false;
      let publishCalled = false;
      let regionCount = 0;

      globalThis.fetch = createMockFetch({
        "/api/resolution": () =>
          jsonResponse([{ resolutionId: 1, resolution: "1080x1920", width: 1080, height: 1920 }]),
        "/api/layout/publish/": () => {
          publishCalled = true;
          return jsonResponse({});
        },
        "/api/layout": (_url, init) => {
          if (init?.method === "POST") {
            layoutCreated = true;
            return jsonResponse({ layoutId: 100, layout: "Test", description: "", status: 1, width: 1080, height: 1920, publishedStatusId: 1 });
          }
          return jsonResponse([]);
        },
        "/api/region/": () => {
          regionCount++;
          return jsonResponse({ regionId: regionCount, width: 100, height: 100, top: 0, left: 0, zIndex: 0 });
        },
        "/api/playlist/widget/text/": () => jsonResponse({ widgetId: 1, type: "text", displayOrder: 1 }),
      });

      const layout = await buildLayoutFromTemplate(
        { apiUrl: XIBO_URL, clientId: "test-id", clientSecret: "test-secret" },
        "grid-3x4",
        "Test Layout",
        sampleProducts,
      );

      expect(layoutCreated).toBe(true);
      expect(publishCalled).toBe(true);
      expect(layout.layoutId).toBe(100);
      // 1 header + 12 grid cells = 13 regions
      expect(regionCount).toBe(13);
    });

    test("builds layout with list-6 template", async () => {
      let regionCount = 0;

      globalThis.fetch = createMockFetch({
        "/api/resolution": () =>
          jsonResponse([{ resolutionId: 1, resolution: "1080x1920", width: 1080, height: 1920 }]),
        "/api/layout/publish/": () => jsonResponse({}),
        "/api/layout": () =>
          jsonResponse({ layoutId: 200, layout: "List", description: "", status: 1, width: 1080, height: 1920, publishedStatusId: 1 }),
        "/api/region/": () => {
          regionCount++;
          return jsonResponse({ regionId: regionCount, width: 100, height: 100, top: 0, left: 0, zIndex: 0 });
        },
        "/api/playlist/widget/text/": () => jsonResponse({ widgetId: 1, type: "text", displayOrder: 1 }),
      });

      const layout = await buildLayoutFromTemplate(
        { apiUrl: XIBO_URL, clientId: "test-id", clientSecret: "test-secret" },
        "list-6",
        "List Layout",
        sampleProducts,
      );

      expect(layout.layoutId).toBe(200);
      // 1 header + 6 list items = 7 regions
      expect(regionCount).toBe(7);
    });

    test("throws for unknown template", async () => {
      try {
        await buildLayoutFromTemplate(
          { apiUrl: XIBO_URL, clientId: "test-id", clientSecret: "test-secret" },
          "unknown",
          "Bad",
          [],
        );
        expect(true).toBe(false); // Should not reach here
      } catch (e) {
        expect((e as Error).message).toContain("Unknown template");
      }
    });

    test("handles empty products list", async () => {
      let regionCount = 0;

      globalThis.fetch = createMockFetch({
        "/api/resolution": () =>
          jsonResponse([{ resolutionId: 1, resolution: "1080x1920", width: 1080, height: 1920 }]),
        "/api/layout/publish/": () => jsonResponse({}),
        "/api/layout": () =>
          jsonResponse({ layoutId: 300, layout: "Empty", description: "", status: 1, width: 1080, height: 1920, publishedStatusId: 1 }),
        "/api/region/": () => {
          regionCount++;
          return jsonResponse({ regionId: regionCount, width: 100, height: 100, top: 0, left: 0, zIndex: 0 });
        },
        "/api/playlist/widget/text/": () => jsonResponse({ widgetId: 1, type: "text", displayOrder: 1 }),
      });

      const layout = await buildLayoutFromTemplate(
        { apiUrl: XIBO_URL, clientId: "test-id", clientSecret: "test-secret" },
        "grid-3x4",
        "Empty Layout",
        [],
      );

      expect(layout.layoutId).toBe(300);
      // Still creates regions even with no products
      expect(regionCount).toBe(13);
    });
  });

  describe("rebuildLayout", () => {
    test("creates a new layout from template (delegates to buildLayoutFromTemplate)", async () => {
      let regionCount = 0;

      globalThis.fetch = createMockFetch({
        "/api/resolution": () =>
          jsonResponse([{ resolutionId: 1, resolution: "1080x1920", width: 1080, height: 1920 }]),
        "/api/layout/publish/": () => jsonResponse({}),
        "/api/layout": () =>
          jsonResponse({ layoutId: 400, layout: "Rebuilt", description: "", status: 1, width: 1080, height: 1920, publishedStatusId: 1 }),
        "/api/region/": () => {
          regionCount++;
          return jsonResponse({ regionId: regionCount, width: 100, height: 100, top: 0, left: 0, zIndex: 0 });
        },
        "/api/playlist/widget/text/": () => jsonResponse({ widgetId: 1, type: "text", displayOrder: 1 }),
      });

      const products: TemplateProduct[] = [
        { name: "Latte", price: "5.00" },
      ];

      const layout = await rebuildLayout(
        { apiUrl: XIBO_URL, clientId: "test-id", clientSecret: "test-secret" },
        "grid-3x4",
        "Rebuilt Layout",
        products,
        999, // old layout ID (ignored by rebuildLayout)
      );

      expect(layout.layoutId).toBe(400);
      expect(regionCount).toBe(13);
    });
  });
});
