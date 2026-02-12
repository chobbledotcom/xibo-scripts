/**
 * Tests for menu screen database operations
 *
 * Covers CRUD operations for menu_screens and menu_screen_items tables.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "#test-compat";
import {
  createMenuScreen,
  deleteMenuScreen,
  getMenuScreenById,
  getMenuScreenItems,
  getMenuScreensForScreen,
  setMenuScreenItems,
  toDisplayMenuScreen,
  updateMenuScreen,
  updateMenuScreenCampaignId,
  updateMenuScreenLayoutId,
} from "#lib/db/menu-screens.ts";
import { createBusiness } from "#lib/db/businesses.ts";
import { createScreen } from "#lib/db/screens.ts";
import {
  createTestDbWithSetup,
  resetDb,
} from "#test-utils";

describe("menu screen DB operations", () => {
  let screenId: number;

  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
    const biz = await createBusiness("Test Cafe");
    const screen = await createScreen("Main Display", biz.id, null);
    screenId = screen.id;
  });

  afterEach(() => {
    resetDb();
  });

  describe("createMenuScreen", () => {
    test("creates a menu screen with encrypted fields", async () => {
      const ms = await createMenuScreen("Morning Menu", screenId, "grid-3x4", 30, 1);
      expect(ms.id).toBe(1);
      expect(ms.screen_id).toBe(screenId);
      expect(ms.template_id).toBe("grid-3x4");
      expect(ms.display_time).toBe(30);
      expect(ms.sort_order).toBe(1);
      expect(ms.xibo_layout_id).toBeNull();
      expect(ms.xibo_campaign_id).toBeNull();

      const display = await toDisplayMenuScreen(ms);
      expect(display.name).toBe("Morning Menu");
    });

    test("creates multiple menu screens with incrementing IDs", async () => {
      const ms1 = await createMenuScreen("Menu A", screenId, "grid-3x4", 20, 0);
      const ms2 = await createMenuScreen("Menu B", screenId, "list-6", 15, 1);
      expect(ms1.id).toBe(1);
      expect(ms2.id).toBe(2);
    });
  });

  describe("getMenuScreenById", () => {
    test("returns menu screen when found", async () => {
      const created = await createMenuScreen("Find Me", screenId, "list-6", 10, 0);
      const found = await getMenuScreenById(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.template_id).toBe("list-6");
    });

    test("returns null when not found", async () => {
      const found = await getMenuScreenById(999);
      expect(found).toBeNull();
    });
  });

  describe("getMenuScreensForScreen", () => {
    test("returns menu screens ordered by sort_order", async () => {
      await createMenuScreen("Second", screenId, "grid-3x4", 20, 2);
      await createMenuScreen("First", screenId, "list-6", 10, 1);
      await createMenuScreen("Third", screenId, "grid-3x4", 30, 3);

      const menuScreens = await getMenuScreensForScreen(screenId);
      expect(menuScreens.length).toBe(3);
      expect(menuScreens[0]!.sort_order).toBe(1);
      expect(menuScreens[1]!.sort_order).toBe(2);
      expect(menuScreens[2]!.sort_order).toBe(3);
    });

    test("returns empty array when none exist", async () => {
      const menuScreens = await getMenuScreensForScreen(screenId);
      expect(menuScreens.length).toBe(0);
    });

    test("only returns menu screens for specified screen", async () => {
      const biz = await createBusiness("Other Cafe");
      const otherScreen = await createScreen("Other", biz.id, null);
      await createMenuScreen("For Screen 1", screenId, "grid-3x4", 20, 0);
      await createMenuScreen("For Other Screen", otherScreen.id, "list-6", 10, 0);

      const menuScreens = await getMenuScreensForScreen(screenId);
      expect(menuScreens.length).toBe(1);
    });
  });

  describe("updateMenuScreen", () => {
    test("updates editable fields", async () => {
      const ms = await createMenuScreen("Original", screenId, "grid-3x4", 20, 0);
      await updateMenuScreen(ms.id, "Updated", "list-6", 45, 5);

      const found = await getMenuScreenById(ms.id);
      expect(found).not.toBeNull();
      expect(found!.template_id).toBe("list-6");
      expect(found!.display_time).toBe(45);
      expect(found!.sort_order).toBe(5);

      const display = await toDisplayMenuScreen(found!);
      expect(display.name).toBe("Updated");
    });
  });

  describe("updateMenuScreenLayoutId", () => {
    test("sets the Xibo layout ID", async () => {
      const ms = await createMenuScreen("Layout Test", screenId, "grid-3x4", 20, 0);
      await updateMenuScreenLayoutId(ms.id, 42);

      const found = await getMenuScreenById(ms.id);
      expect(found!.xibo_layout_id).toBe(42);
    });
  });

  describe("updateMenuScreenCampaignId", () => {
    test("sets the Xibo campaign ID", async () => {
      const ms = await createMenuScreen("Campaign Test", screenId, "grid-3x4", 20, 0);
      await updateMenuScreenCampaignId(ms.id, 99);

      const found = await getMenuScreenById(ms.id);
      expect(found!.xibo_campaign_id).toBe(99);
    });

    test("clears the campaign ID with null", async () => {
      const ms = await createMenuScreen("Clear Test", screenId, "grid-3x4", 20, 0);
      await updateMenuScreenCampaignId(ms.id, 99);
      await updateMenuScreenCampaignId(ms.id, null);

      const found = await getMenuScreenById(ms.id);
      expect(found!.xibo_campaign_id).toBeNull();
    });
  });

  describe("deleteMenuScreen", () => {
    test("deletes menu screen and its items", async () => {
      const ms = await createMenuScreen("Delete Me", screenId, "grid-3x4", 20, 0);
      await setMenuScreenItems(ms.id, [1, 2, 3]);

      await deleteMenuScreen(ms.id);

      const found = await getMenuScreenById(ms.id);
      expect(found).toBeNull();

      const items = await getMenuScreenItems(ms.id);
      expect(items.length).toBe(0);
    });

    test("does not affect other menu screens", async () => {
      const ms1 = await createMenuScreen("Keep", screenId, "grid-3x4", 20, 0);
      const ms2 = await createMenuScreen("Delete", screenId, "list-6", 10, 1);

      await deleteMenuScreen(ms2.id);

      const found = await getMenuScreenById(ms1.id);
      expect(found).not.toBeNull();
    });
  });

  describe("menu screen items", () => {
    test("setMenuScreenItems stores product row IDs with sort order", async () => {
      const ms = await createMenuScreen("Item Test", screenId, "grid-3x4", 20, 0);
      await setMenuScreenItems(ms.id, [10, 20, 30]);

      const items = await getMenuScreenItems(ms.id);
      expect(items.length).toBe(3);
      expect(items[0]!.product_row_id).toBe(10);
      expect(items[0]!.sort_order).toBe(0);
      expect(items[1]!.product_row_id).toBe(20);
      expect(items[1]!.sort_order).toBe(1);
      expect(items[2]!.product_row_id).toBe(30);
      expect(items[2]!.sort_order).toBe(2);
    });

    test("setMenuScreenItems replaces existing items", async () => {
      const ms = await createMenuScreen("Replace Test", screenId, "grid-3x4", 20, 0);
      await setMenuScreenItems(ms.id, [1, 2, 3]);
      await setMenuScreenItems(ms.id, [4, 5]);

      const items = await getMenuScreenItems(ms.id);
      expect(items.length).toBe(2);
      expect(items[0]!.product_row_id).toBe(4);
      expect(items[1]!.product_row_id).toBe(5);
    });

    test("setMenuScreenItems with empty array clears all items", async () => {
      const ms = await createMenuScreen("Clear Test", screenId, "grid-3x4", 20, 0);
      await setMenuScreenItems(ms.id, [1, 2]);
      await setMenuScreenItems(ms.id, []);

      const items = await getMenuScreenItems(ms.id);
      expect(items.length).toBe(0);
    });

    test("getMenuScreenItems returns empty for nonexistent menu screen", async () => {
      const items = await getMenuScreenItems(999);
      expect(items.length).toBe(0);
    });
  });

  describe("toDisplayMenuScreen", () => {
    test("decrypts name and created_at fields", async () => {
      const ms = await createMenuScreen("Decrypt Test", screenId, "grid-3x4", 25, 3);
      const display = await toDisplayMenuScreen(ms);
      expect(display.name).toBe("Decrypt Test");
      expect(display.id).toBe(ms.id);
      expect(display.template_id).toBe("grid-3x4");
      expect(display.display_time).toBe(25);
      expect(display.sort_order).toBe(3);
      expect(display.created_at).toBeTruthy();
    });
  });
});
