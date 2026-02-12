/**
 * Tests for display scheduling (campaign/schedule management)
 *
 * Verifies campaign creation, update, schedule assignment,
 * and the rebuild flow with mocked Xibo API.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "#test-compat";
import {
  buildCampaignLayouts,
  createCampaign,
  deleteCampaign,
  deleteScheduleEvent,
  getSchedulesForDisplay,
  rebuildScreenSchedule,
  scheduleCampaign,
  updateCampaign,
} from "#xibo/scheduling.ts";
import type { DisplayMenuScreen } from "#lib/db/menu-screens.ts";
import type { XiboConfig } from "#xibo/types.ts";
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

const config: XiboConfig = {
  apiUrl: XIBO_URL,
  clientId: "test-id",
  clientSecret: "test-secret",
};

const makeDisplayMenuScreen = (
  overrides: Partial<DisplayMenuScreen> = {},
): DisplayMenuScreen => ({
  id: 1,
  name: "Test Menu",
  screen_id: 1,
  template_id: "grid-3x4",
  display_time: 30,
  sort_order: 0,
  xibo_layout_id: null,
  xibo_campaign_id: null,
  created_at: "2024-01-01T00:00:00Z",
  ...overrides,
});

describe("display scheduling", () => {
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

  describe("buildCampaignLayouts", () => {
    test("builds layout assignments from menu screens with layout IDs", () => {
      const menuScreens = [
        makeDisplayMenuScreen({ id: 1, xibo_layout_id: 10, sort_order: 0 }),
        makeDisplayMenuScreen({ id: 2, xibo_layout_id: 20, sort_order: 1 }),
        makeDisplayMenuScreen({ id: 3, xibo_layout_id: 30, sort_order: 2 }),
      ];

      const layouts = buildCampaignLayouts(menuScreens);
      expect(layouts.length).toBe(3);
      expect(layouts[0]!.layoutId).toBe(10);
      expect(layouts[0]!.displayOrder).toBe(1);
      expect(layouts[1]!.layoutId).toBe(20);
      expect(layouts[1]!.displayOrder).toBe(2);
      expect(layouts[2]!.layoutId).toBe(30);
      expect(layouts[2]!.displayOrder).toBe(3);
    });

    test("excludes menu screens without layout IDs", () => {
      const menuScreens = [
        makeDisplayMenuScreen({ id: 1, xibo_layout_id: 10 }),
        makeDisplayMenuScreen({ id: 2, xibo_layout_id: null }),
        makeDisplayMenuScreen({ id: 3, xibo_layout_id: 30 }),
      ];

      const layouts = buildCampaignLayouts(menuScreens);
      expect(layouts.length).toBe(2);
      expect(layouts[0]!.layoutId).toBe(10);
      expect(layouts[1]!.layoutId).toBe(30);
    });

    test("returns empty array when no menu screens have layouts", () => {
      const menuScreens = [
        makeDisplayMenuScreen({ xibo_layout_id: null }),
      ];

      const layouts = buildCampaignLayouts(menuScreens);
      expect(layouts.length).toBe(0);
    });

    test("returns empty array for empty input", () => {
      const layouts = buildCampaignLayouts([]);
      expect(layouts.length).toBe(0);
    });
  });

  describe("createCampaign", () => {
    test("creates campaign and assigns layouts", async () => {
      let campaignCreated = false;
      let assignCount = 0;

      globalThis.fetch = createMockFetch({
        "/api/campaign": (_url, init) => {
          if (init?.method === "POST" && !_url.includes("/layout/assign")) {
            campaignCreated = true;
            return jsonResponse({ campaignId: 50, campaign: "Test", isLayoutSpecific: 0, totalDuration: 0 });
          }
          if (_url.includes("/layout/assign")) {
            assignCount++;
            return jsonResponse({});
          }
          return jsonResponse([]);
        },
      });

      const campaign = await createCampaign(config, "Test Campaign", [
        { layoutId: 10, displayOrder: 1 },
        { layoutId: 20, displayOrder: 2 },
      ]);

      expect(campaignCreated).toBe(true);
      expect(campaign.campaignId).toBe(50);
      expect(assignCount).toBe(2);
    });
  });

  describe("updateCampaign", () => {
    test("updates campaign with new layouts", async () => {
      let assignCount = 0;

      globalThis.fetch = createMockFetch({
        "/api/campaign": (_url, init) => {
          if (_url.includes("/layout/assign") && init?.method === "POST") {
            assignCount++;
            return jsonResponse({});
          }
          if (init?.method === "PUT") {
            return jsonResponse({ campaignId: 50, campaign: "Test", isLayoutSpecific: 0, totalDuration: 0 });
          }
          // GET for campaign list
          return jsonResponse([{ campaignId: 50, campaign: "Test", isLayoutSpecific: 0, totalDuration: 0 }]);
        },
      });

      await updateCampaign(config, 50, [
        { layoutId: 30, displayOrder: 1 },
      ]);

      expect(assignCount).toBe(1);
    });

    test("continues when put fails during campaign update", async () => {
      let assignCount = 0;

      globalThis.fetch = createMockFetch({
        "/api/campaign": (_url, init) => {
          if (_url.includes("/layout/assign") && init?.method === "POST") {
            assignCount++;
            return jsonResponse({});
          }
          if (init?.method === "PUT") {
            return new Response("Internal Server Error", { status: 500 });
          }
          // GET for campaign list
          return jsonResponse([{ campaignId: 50, campaign: "Test", isLayoutSpecific: 0, totalDuration: 0 }]);
        },
      });

      await updateCampaign(config, 50, [
        { layoutId: 30, displayOrder: 1 },
      ]);

      expect(assignCount).toBe(1);
    });
  });

  describe("deleteCampaign", () => {
    test("calls DELETE on campaign endpoint", async () => {
      let deleteCalled = false;

      globalThis.fetch = createMockFetch({
        "/api/campaign/50": (_url, init) => {
          if (init?.method === "DELETE") {
            deleteCalled = true;
            return new Response(null, { status: 204 });
          }
          return jsonResponse([]);
        },
      });

      await deleteCampaign(config, 50);
      expect(deleteCalled).toBe(true);
    });
  });

  describe("getSchedulesForDisplay", () => {
    test("fetches schedules for a display group", async () => {
      globalThis.fetch = createMockFetch({
        "/api/schedule": () =>
          jsonResponse([
            { eventId: 1, eventTypeId: 1, campaignId: 50, displayGroupIds: [10], fromDt: null, toDt: null, isPriority: 0 },
            { eventId: 2, eventTypeId: 1, campaignId: 51, displayGroupIds: [10], fromDt: null, toDt: null, isPriority: 0 },
          ]),
      });

      const schedules = await getSchedulesForDisplay(config, 10);
      expect(schedules.length).toBe(2);
      expect(schedules[0]!.eventId).toBe(1);
      expect(schedules[1]!.eventId).toBe(2);
    });
  });

  describe("deleteScheduleEvent", () => {
    test("calls DELETE on schedule endpoint", async () => {
      let deleteCalled = false;

      globalThis.fetch = createMockFetch({
        "/api/schedule/5": (_url, init) => {
          if (init?.method === "DELETE") {
            deleteCalled = true;
            return new Response(null, { status: 204 });
          }
          return jsonResponse([]);
        },
      });

      await deleteScheduleEvent(config, 5);
      expect(deleteCalled).toBe(true);
    });
  });

  describe("scheduleCampaign", () => {
    test("creates schedule event for display group", async () => {
      let capturedBody: Record<string, unknown> | null = null;

      globalThis.fetch = createMockFetch({
        "/api/schedule": (_url, init) => {
          if (init?.method === "POST") {
            capturedBody = JSON.parse(init.body as string);
            return jsonResponse({
              eventId: 1,
              eventTypeId: 1,
              campaignId: 50,
              displayGroupIds: [10],
              fromDt: null,
              toDt: null,
              isPriority: 0,
            });
          }
          return jsonResponse([]);
        },
      });

      const schedule = await scheduleCampaign(config, 50, 10);
      expect(schedule.eventId).toBe(1);
      expect(capturedBody).not.toBeNull();
      expect(capturedBody!.campaignId).toBe(50);
      expect(capturedBody!.displayGroupIds).toEqual([10]);
    });
  });

  describe("rebuildScreenSchedule", () => {
    test("creates new campaign when no existing one", async () => {
      let campaignCreated = false;
      let scheduleCalled = false;

      globalThis.fetch = createMockFetch({
        "/api/campaign": (_url, init) => {
          if (init?.method === "POST" && !_url.includes("/layout/assign")) {
            campaignCreated = true;
            return jsonResponse({ campaignId: 75, campaign: "Screen: Test", isLayoutSpecific: 0, totalDuration: 0 });
          }
          if (_url.includes("/layout/assign")) {
            return jsonResponse({});
          }
          return jsonResponse([]);
        },
        "/api/schedule": (_url, init) => {
          if (init?.method === "POST") {
            scheduleCalled = true;
            return jsonResponse({ eventId: 1, eventTypeId: 1, campaignId: 75, displayGroupIds: [5], fromDt: null, toDt: null, isPriority: 0 });
          }
          return jsonResponse([]);
        },
      });

      const menuScreens = [
        makeDisplayMenuScreen({ id: 1, xibo_layout_id: 10, sort_order: 0 }),
      ];

      const result = await rebuildScreenSchedule(config, menuScreens, "Test", 5, null);
      expect(campaignCreated).toBe(true);
      expect(scheduleCalled).toBe(true);
      expect(result.campaignId).toBe(75);
    });

    test("updates existing campaign", async () => {
      let assignCount = 0;

      globalThis.fetch = createMockFetch({
        "/api/campaign": (_url, init) => {
          if (_url.includes("/layout/assign") && init?.method === "POST") {
            assignCount++;
            return jsonResponse({});
          }
          if (init?.method === "PUT") {
            return jsonResponse({ campaignId: 60, campaign: "Existing", isLayoutSpecific: 0, totalDuration: 0 });
          }
          return jsonResponse([{ campaignId: 60, campaign: "Existing", isLayoutSpecific: 0, totalDuration: 0 }]);
        },
      });

      const menuScreens = [
        makeDisplayMenuScreen({ id: 1, xibo_layout_id: 10 }),
        makeDisplayMenuScreen({ id: 2, xibo_layout_id: 20 }),
      ];

      const result = await rebuildScreenSchedule(config, menuScreens, "Test", 5, 60);
      expect(result.campaignId).toBe(60);
      expect(assignCount).toBe(2);
    });

    test("handles empty menu screens by deleting campaign", async () => {
      let deleteCalled = false;

      globalThis.fetch = createMockFetch({
        "/api/campaign/60": (_url, init) => {
          if (init?.method === "DELETE") {
            deleteCalled = true;
            return new Response(null, { status: 204 });
          }
          return jsonResponse([]);
        },
      });

      const result = await rebuildScreenSchedule(config, [], "Test", 5, 60);
      expect(deleteCalled).toBe(true);
      expect(result.campaignId).toBe(60);
    });

    test("returns existing campaign ID when no layouts and no existing campaign", async () => {
      const result = await rebuildScreenSchedule(config, [], "Test", 5, null);
      expect(result.campaignId).toBe(0);
    });

    test("handles deleteCampaign failure when no layouts and existing campaign", async () => {
      globalThis.fetch = createMockFetch({
        "/api/campaign/60": (_url, init) => {
          if (init?.method === "DELETE") {
            return new Response("Internal Server Error", { status: 500 });
          }
          return jsonResponse([]);
        },
      });

      const result = await rebuildScreenSchedule(config, [], "Test", 5, 60);
      expect(result.campaignId).toBe(60);
    });
  });
});
