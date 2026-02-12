/**
 * Tests for user product management templates
 */

import { describe, expect, test } from "#test-compat";
import type { AdminSession, Business } from "#lib/types.ts";
import type { DatasetProduct } from "#xibo/types.ts";
import {
  userProductCreatePage,
  userProductEditPage,
  userProductListPage,
} from "#templates/user/products.tsx";

const session: AdminSession = {
  csrfToken: "test-csrf",
  adminLevel: "user",
};

const business: Business = {
  id: 1,
  name: "Ice Cream Van",
  xibo_folder_id: 100,
  folder_name: "icecream-abc",
  xibo_dataset_id: 500,
  created_at: "2024-01-15T10:00:00Z",
};

const products: DatasetProduct[] = [
  { id: 1, name: "Vanilla", price: "3.50", media_id: null, available: 1, sort_order: 0 },
  { id: 2, name: "Chocolate", price: "4.00", media_id: 10, available: 0, sort_order: 1 },
];

const media = [
  { mediaId: 10, name: "ice-cream.jpg" },
  { mediaId: 20, name: "shared-bg.png" },
];

describe("userProductListPage", () => {
  test("renders product table with data", () => {
    const html = userProductListPage(session, business, products);
    expect(html).toContain("Vanilla");
    expect(html).toContain("Chocolate");
    expect(html).toContain("3.50");
    expect(html).toContain("4.00");
  });

  test("shows availability status", () => {
    const html = userProductListPage(session, business, products);
    expect(html).toContain("Yes");
    expect(html).toContain("No");
  });

  test("shows toggle buttons", () => {
    const html = userProductListPage(session, business, products);
    expect(html).toContain("Disable");
    expect(html).toContain("Enable");
  });

  test("shows delete buttons with CSRF", () => {
    const html = userProductListPage(session, business, products);
    expect(html).toContain("/product/1/delete");
    expect(html).toContain("/product/2/delete");
    expect(html).toContain("test-csrf");
  });

  test("shows empty state when no products", () => {
    const html = userProductListPage(session, business, []);
    expect(html).toContain("No products yet");
    expect(html).toContain("Add Product");
  });

  test("renders success message", () => {
    const html = userProductListPage(session, business, products, "Product added");
    expect(html).toContain("Product added");
  });

  test("renders error message", () => {
    const html = userProductListPage(
      session,
      business,
      [],
      undefined,
      "Failed to load",
    );
    expect(html).toContain("Failed to load");
  });

  test("renders breadcrumb to dashboard", () => {
    const html = userProductListPage(session, business, products);
    expect(html).toContain('href="/dashboard"');
  });

  test("shows edit links for each product", () => {
    const html = userProductListPage(session, business, products);
    expect(html).toContain("/dashboard/business/1/product/1");
    expect(html).toContain("/dashboard/business/1/product/2");
  });
});

describe("userProductCreatePage", () => {
  test("renders create form with fields", () => {
    const html = userProductCreatePage(session, business, media);
    expect(html).toContain("Add Product");
    expect(html).toContain("Name");
    expect(html).toContain("Price");
    expect(html).toContain("csrf_token");
  });

  test("shows image picker with media options", () => {
    const html = userProductCreatePage(session, business, media);
    expect(html).toContain("ice-cream.jpg");
    expect(html).toContain("shared-bg.png");
    expect(html).toContain("No image");
  });

  test("shows upload link when no media available", () => {
    const html = userProductCreatePage(session, business, []);
    expect(html).toContain("Upload photos");
  });

  test("renders error message", () => {
    const html = userProductCreatePage(session, business, media, "Name is required");
    expect(html).toContain("Name is required");
  });

  test("posts to correct action URL", () => {
    const html = userProductCreatePage(session, business, media);
    expect(html).toContain(
      `action="/dashboard/business/${business.id}/product/create"`,
    );
  });
});

describe("userProductEditPage", () => {
  const product: DatasetProduct = products[0]!;

  test("renders edit form with product data", () => {
    const html = userProductEditPage(session, business, product, media);
    expect(html).toContain("Edit Vanilla");
    expect(html).toContain('value="3.50"');
    expect(html).toContain('value="Vanilla"');
  });

  test("shows image picker with current selection", () => {
    const productWithMedia: DatasetProduct = {
      ...product,
      media_id: 10,
    };
    const html = userProductEditPage(session, business, productWithMedia, media);
    expect(html).toContain("ice-cream.jpg");
    // The selected option should be marked
    expect(html).toContain("selected");
  });

  test("posts to correct action URL", () => {
    const html = userProductEditPage(session, business, product, media);
    expect(html).toContain(
      `action="/dashboard/business/${business.id}/product/${product.id}"`,
    );
  });

  test("renders error message", () => {
    const html = userProductEditPage(
      session,
      business,
      product,
      media,
      "Update failed",
    );
    expect(html).toContain("Update failed");
  });

  test("renders breadcrumb to product list", () => {
    const html = userProductEditPage(session, business, product, media);
    expect(html).toContain(`/dashboard/business/${business.id}/products`);
  });
});
