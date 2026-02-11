/**
 * Tests for layout admin templates
 */

import { describe, expect, test } from "#test-compat";
import {
  layoutDetailPage,
  layoutListPage,
} from "#templates/admin/layouts.tsx";
import type { XiboLayout } from "#xibo/types.ts";
import type { AdminSession } from "#lib/types.ts";

const session: AdminSession = {
  csrfToken: "csrf-test",
  adminLevel: "owner",
};

const sampleLayouts: XiboLayout[] = [
  {
    layoutId: 1,
    layout: "Menu - Burgers",
    description: "Auto-generated",
    status: 3,
    width: 1080,
    height: 1920,
    publishedStatusId: 1,
  },
  {
    layoutId: 2,
    layout: "Menu - Drinks",
    description: "",
    status: 1,
    width: 1080,
    height: 1920,
    publishedStatusId: 0,
  },
];

describe("layoutListPage", () => {
  test("renders layout table with data", () => {
    const html = layoutListPage(session, sampleLayouts);
    expect(html).toContain("Layouts");
    expect(html).toContain("Menu - Burgers");
    expect(html).toContain("Menu - Drinks");
    expect(html).toContain("1080x1920");
    expect(html).toContain("Published");
    expect(html).toContain("Draft");
    expect(html).toContain("2 layouts");
  });

  test("renders empty state", () => {
    const html = layoutListPage(session, []);
    expect(html).toContain("No layouts found");
    expect(html).toContain("0 layouts");
  });

  test("renders singular count", () => {
    const html = layoutListPage(session, [sampleLayouts[0]!]);
    expect(html).toContain("1 layout");
    expect(html).not.toContain("1 layouts");
  });

  test("renders success message", () => {
    const html = layoutListPage(session, [], "Layout created");
    expect(html).toContain("Layout created");
  });

  test("renders error message", () => {
    const html = layoutListPage(session, [], undefined, "API failed");
    expect(html).toContain("API failed");
  });
});

describe("layoutDetailPage", () => {
  test("renders layout detail with all fields", () => {
    const html = layoutDetailPage(session, sampleLayouts[0]!);
    expect(html).toContain("Menu - Burgers");
    expect(html).toContain("Auto-generated");
    expect(html).toContain("1080x1920");
    expect(html).toContain("Published");
    expect(html).toContain("Delete Layout");
  });

  test("renders grid preview", () => {
    const html = layoutDetailPage(session, sampleLayouts[0]!);
    expect(html).toContain("Grid Preview");
    expect(html).toContain("Header");
  });

  test("renders dash for empty description", () => {
    const html = layoutDetailPage(session, sampleLayouts[1]!);
    expect(html).toContain("—");
  });
});
