/**
 * Tests for layout page templates
 */

import { describe, expect, test } from "#test-compat";
import {
  layoutCreatePage,
  layoutDetailPage,
  layoutListPage,
} from "#templates/admin/layouts.tsx";
import type { AdminSession } from "#lib/types.ts";
import type {
  XiboCategory,
  XiboLayout,
  XiboMenuBoard,
} from "#xibo/types.ts";

const session: AdminSession = {
  csrfToken: "test-csrf-token",
  adminLevel: "owner",
};

const sampleLayouts: XiboLayout[] = [
  {
    layoutId: 1,
    layout: "Menu - Drinks",
    description: "Auto-generated layout",
    status: 3,
    width: 1080,
    height: 1920,
    publishedStatusId: 1,
  },
  {
    layoutId: 2,
    layout: "Menu - Food",
    description: "",
    status: 2,
    width: 1080,
    height: 1920,
    publishedStatusId: 2,
  },
];

const sampleBoards: XiboMenuBoard[] = [
  {
    menuBoardId: 1,
    name: "Main Menu",
    code: "MM",
    description: "",
    modifiedDt: "2024-01-01",
  },
];

const sampleCategories: Array<{
  board: XiboMenuBoard;
  category: XiboCategory;
}> = [
  {
    board: sampleBoards[0]!,
    category: {
      menuCategoryId: 10,
      menuId: 1,
      name: "Drinks",
      code: "DRK",
      mediaId: null,
    },
  },
];

describe("layoutListPage", () => {
  test("renders layout list with data", () => {
    const html = layoutListPage(session, sampleLayouts);
    expect(html).toContain("Layouts");
    expect(html).toContain("Menu - Drinks");
    expect(html).toContain("Menu - Food");
    expect(html).toContain("1080x1920");
    expect(html).toContain("/admin/layout/1");
    expect(html).toContain("/admin/layout/2");
  });

  test("renders published status label", () => {
    const html = layoutListPage(session, sampleLayouts);
    expect(html).toContain("Published");
    expect(html).toContain("Draft");
  });

  test("renders empty state", () => {
    const html = layoutListPage(session, []);
    expect(html).toContain("No layouts found");
  });

  test("renders success message", () => {
    const html = layoutListPage(session, [], "Layout created");
    expect(html).toContain("Layout created");
  });

  test("renders error message", () => {
    const html = layoutListPage(session, [], undefined, "API error");
    expect(html).toContain("API error");
  });

  test("renders create link", () => {
    const html = layoutListPage(session, []);
    expect(html).toContain("/admin/layout/create");
  });

  test("renders delete all button when layouts exist", () => {
    const html = layoutListPage(session, sampleLayouts);
    expect(html).toContain("Delete All Layouts");
    expect(html).toContain("/admin/layouts/delete-all");
  });

  test("renders layout count", () => {
    const html = layoutListPage(session, sampleLayouts);
    expect(html).toContain("2 layouts");
  });

  test("renders singular layout count", () => {
    const html = layoutListPage(session, [sampleLayouts[0]!]);
    expect(html).toContain("1 layout");
  });
});

describe("layoutDetailPage", () => {
  test("renders layout details", () => {
    const html = layoutDetailPage(session, sampleLayouts[0]!);
    expect(html).toContain("Menu - Drinks");
    expect(html).toContain("Auto-generated layout");
    expect(html).toContain("1080x1920");
    expect(html).toContain("Published");
  });

  test("renders grid preview", () => {
    const html = layoutDetailPage(session, sampleLayouts[0]!);
    expect(html).toContain("Grid Preview");
    expect(html).toContain("Header");
  });

  test("renders delete button with CSRF", () => {
    const html = layoutDetailPage(session, sampleLayouts[0]!);
    expect(html).toContain("Delete Layout");
    expect(html).toContain("test-csrf-token");
    expect(html).toContain("/admin/layout/1/delete");
  });

  test("renders breadcrumb to layouts list", () => {
    const html = layoutDetailPage(session, sampleLayouts[0]!);
    expect(html).toContain("/admin/layouts");
  });

  test("shows dash for empty description", () => {
    const html = layoutDetailPage(session, sampleLayouts[1]!);
    expect(html).toContain("—");
  });
});

describe("layoutCreatePage", () => {
  test("renders create form with category options", () => {
    const html = layoutCreatePage(
      session,
      sampleBoards,
      sampleCategories,
    );
    expect(html).toContain("Create Layout");
    expect(html).toContain("Main Menu");
    expect(html).toContain("Drinks");
    expect(html).toContain("1:10");
    expect(html).toContain("Generate Layout");
  });

  test("renders empty state when no categories", () => {
    const html = layoutCreatePage(session, [], []);
    expect(html).toContain("No menu board categories available");
    expect(html).toContain("/admin/menuboards");
  });

  test("renders error message", () => {
    const html = layoutCreatePage(
      session,
      [],
      [],
      "Something went wrong",
    );
    expect(html).toContain("Something went wrong");
  });

  test("renders CSRF token", () => {
    const html = layoutCreatePage(
      session,
      sampleBoards,
      sampleCategories,
    );
    expect(html).toContain("test-csrf-token");
  });

  test("renders breadcrumb to layouts list", () => {
    const html = layoutCreatePage(session, [], []);
    expect(html).toContain("/admin/layouts");
  });
});
