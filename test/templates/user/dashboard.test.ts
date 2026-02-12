/**
 * Tests for user dashboard templates
 */

import { describe, expect, test } from "#test-compat";
import type { AdminSession } from "#lib/types.ts";
import type { DisplayBusiness } from "#lib/db/businesses.ts";
import {
  userDashboardPage,
  userBusinessDetailPage,
  type BusinessSummary,
} from "#templates/user/dashboard.tsx";

const session: AdminSession = {
  csrfToken: "test-csrf",
  adminLevel: "user",
};

const impersonatingSession: AdminSession = {
  csrfToken: "test-csrf",
  adminLevel: "user",
  impersonating: { username: "admin", userId: 1 },
};

const business1: DisplayBusiness = {
  id: 1,
  name: "Ice Cream Van",
  xibo_folder_id: 100,
  folder_name: "icecream-abc",
  xibo_dataset_id: 500,
  created_at: "2024-01-15T10:00:00Z",
};

const business2: DisplayBusiness = {
  id: 2,
  name: "Pizza Place",
  xibo_folder_id: 200,
  folder_name: "pizza-xyz",
  xibo_dataset_id: 501,
  created_at: "2024-02-20T12:00:00Z",
};

describe("userDashboardPage", () => {
  test("renders business list", () => {
    const html = userDashboardPage(session, [business1, business2]);
    expect(html).toContain("Dashboard");
    expect(html).toContain("Ice Cream Van");
    expect(html).toContain("Pizza Place");
    expect(html).toContain("/dashboard/business/1");
    expect(html).toContain("/dashboard/business/2");
  });

  test("renders empty state when no businesses", () => {
    const html = userDashboardPage(session, []);
    expect(html).toContain("not assigned to any businesses");
  });

  test("shows products and media links per business", () => {
    const html = userDashboardPage(session, [business1]);
    expect(html).toContain("/dashboard/business/1/products");
    expect(html).toContain("/dashboard/media?businessId=1");
  });

  test("shows impersonation banner when impersonating", () => {
    const html = userDashboardPage(impersonatingSession, [business1]);
    expect(html).toContain("impersonating");
    expect(html).toContain("admin");
  });

  test("renders Dashboard link in nav", () => {
    const html = userDashboardPage(session, [business1]);
    expect(html).toContain('href="/dashboard"');
  });
});

describe("userBusinessDetailPage", () => {
  const summary: BusinessSummary = {
    business: business1,
    screenCount: 3,
    productCount: 12,
  };

  test("renders business overview with counts", () => {
    const html = userBusinessDetailPage(session, summary);
    expect(html).toContain("Ice Cream Van");
    expect(html).toContain("3");
    expect(html).toContain("12");
  });

  test("renders quick links", () => {
    const html = userBusinessDetailPage(session, summary);
    expect(html).toContain("Manage Products");
    expect(html).toContain("Manage Media");
    expect(html).toContain("/dashboard/business/1/products");
  });

  test("shows success message", () => {
    const html = userBusinessDetailPage(session, summary, "Product added");
    expect(html).toContain("Product added");
  });

  test("shows error message", () => {
    const html = userBusinessDetailPage(
      session,
      summary,
      undefined,
      "Something went wrong",
    );
    expect(html).toContain("Something went wrong");
  });

  test("renders breadcrumb back to dashboard", () => {
    const html = userBusinessDetailPage(session, summary);
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("Dashboard");
  });
});
