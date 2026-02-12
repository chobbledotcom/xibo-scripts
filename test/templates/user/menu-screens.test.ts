/**
 * Tests for user menu screen page templates
 *
 * Verifies the HTML output of menu screen list, create, and edit pages.
 */

import {
  describe,
  expect,
  test,
} from "#test-compat";
import {
  userMenuScreenCreatePage,
  userMenuScreenEditPage,
  userMenuScreenListPage,
} from "#templates/user/menu-screens.tsx";
import type { AdminSession } from "#lib/types.ts";
import type { DisplayBusiness } from "#lib/db/businesses.ts";
import type { DisplayScreen } from "#lib/db/screens.ts";
import type { DisplayMenuScreen } from "#lib/db/menu-screens.ts";
import { TEMPLATES } from "#lib/templates/index.ts";

const session: AdminSession = {
  csrfToken: "test-csrf-token",
  adminLevel: "user",
};

const business: DisplayBusiness = {
  id: 1,
  name: "Test Cafe",
  xibo_folder_id: 100,
  folder_name: "test-cafe-abc",
  xibo_dataset_id: 500,
  created_at: "2024-01-01",
};

const screen: DisplayScreen = {
  id: 10,
  name: "Main Display",
  business_id: 1,
  xibo_display_id: 5,
  created_at: "2024-01-01",
};

const sampleMenuScreens: DisplayMenuScreen[] = [
  {
    id: 1,
    name: "Morning Menu",
    screen_id: 10,
    template_id: "grid-3x4",
    display_time: 30,
    sort_order: 1,
    xibo_layout_id: 100,
    xibo_campaign_id: 50,
    created_at: "2024-01-01",
  },
  {
    id: 2,
    name: "Lunch Special",
    screen_id: 10,
    template_id: "list-6",
    display_time: 20,
    sort_order: 2,
    xibo_layout_id: 101,
    xibo_campaign_id: 50,
    created_at: "2024-01-01",
  },
];

const sampleProducts = [
  { id: 1, name: "Vanilla", price: "3.50", media_id: null, available: 1, sort_order: 0 },
  { id: 2, name: "Chocolate", price: "4.00", media_id: null, available: 1, sort_order: 1 },
  { id: 3, name: "Strawberry", price: "3.75", media_id: null, available: 0, sort_order: 2 },
];

describe("user menu screen templates", () => {
  describe("userMenuScreenListPage", () => {
    test("renders menu screen list with items", () => {
      const html = userMenuScreenListPage(session, business, screen, sampleMenuScreens);
      expect(html).toContain("Menu Screens - Main Display");
      expect(html).toContain("Morning Menu");
      expect(html).toContain("Lunch Special");
      expect(html).toContain("grid-3x4");
      expect(html).toContain("list-6");
      expect(html).toContain("30s");
      expect(html).toContain("20s");
    });

    test("renders empty state when no menu screens", () => {
      const html = userMenuScreenListPage(session, business, screen, []);
      expect(html).toContain("No menu screens yet");
      expect(html).toContain("Add Menu Screen");
    });

    test("renders success message", () => {
      const html = userMenuScreenListPage(session, business, screen, [], "Menu screen created");
      expect(html).toContain("Menu screen created");
    });

    test("renders error message", () => {
      const html = userMenuScreenListPage(session, business, screen, [], undefined, "Something failed");
      expect(html).toContain("Something failed");
    });

    test("renders delete buttons with CSRF tokens", () => {
      const html = userMenuScreenListPage(session, business, screen, sampleMenuScreens);
      expect(html).toContain("csrf_token");
      expect(html).toContain("test-csrf-token");
      expect(html).toContain("Delete");
    });

    test("links to create page", () => {
      const html = userMenuScreenListPage(session, business, screen, []);
      expect(html).toContain(`/dashboard/business/1/screen/10/menu/create`);
    });
  });

  describe("userMenuScreenCreatePage", () => {
    test("renders create form with templates", () => {
      const html = userMenuScreenCreatePage(
        session,
        business,
        screen,
        TEMPLATES,
        sampleProducts,
      );
      expect(html).toContain("Add Menu Screen");
      expect(html).toContain("grid-3x4");
      expect(html).toContain("list-6");
      expect(html).toContain("3x4 Grid");
      expect(html).toContain("Simple List");
    });

    test("renders product picker with available products", () => {
      const html = userMenuScreenCreatePage(
        session,
        business,
        screen,
        TEMPLATES,
        sampleProducts,
      );
      expect(html).toContain("Vanilla");
      expect(html).toContain("Chocolate");
      // Unavailable product should still show (filter is in template)
    });

    test("renders error message", () => {
      const html = userMenuScreenCreatePage(
        session,
        business,
        screen,
        TEMPLATES,
        [],
        "Validation error",
      );
      expect(html).toContain("Validation error");
    });

    test("shows empty products message when none available", () => {
      const html = userMenuScreenCreatePage(
        session,
        business,
        screen,
        TEMPLATES,
        [],
      );
      expect(html).toContain("No products available");
    });

    test("includes CSRF token in form", () => {
      const html = userMenuScreenCreatePage(
        session,
        business,
        screen,
        TEMPLATES,
        sampleProducts,
      );
      expect(html).toContain("test-csrf-token");
    });
  });

  describe("userMenuScreenEditPage", () => {
    test("renders edit form with existing data", () => {
      const html = userMenuScreenEditPage(
        session,
        business,
        screen,
        sampleMenuScreens[0]!,
        TEMPLATES,
        sampleProducts,
        [1, 2],
      );
      expect(html).toContain("Edit Morning Menu");
      expect(html).toContain("grid-3x4");
    });

    test("pre-selects template", () => {
      const html = userMenuScreenEditPage(
        session,
        business,
        screen,
        sampleMenuScreens[0]!,
        TEMPLATES,
        sampleProducts,
        [],
      );
      // The grid-3x4 template should be checked
      expect(html).toContain('value="grid-3x4"');
    });

    test("pre-selects products", () => {
      const html = userMenuScreenEditPage(
        session,
        business,
        screen,
        sampleMenuScreens[0]!,
        TEMPLATES,
        sampleProducts,
        [1],
      );
      // Product ID 1 checkbox should be checked
      expect(html).toContain('value="1"');
    });

    test("shows max products from selected template", () => {
      const html = userMenuScreenEditPage(
        session,
        business,
        screen,
        sampleMenuScreens[0]!,
        TEMPLATES,
        sampleProducts,
        [],
      );
      // grid-3x4 has maxProducts=12
      expect(html).toContain("(max 12)");
    });

    test("renders breadcrumb back to menu list", () => {
      const html = userMenuScreenEditPage(
        session,
        business,
        screen,
        sampleMenuScreens[0]!,
        TEMPLATES,
        sampleProducts,
        [],
      );
      expect(html).toContain("/dashboard/business/1/screen/10/menus");
    });
  });
});
