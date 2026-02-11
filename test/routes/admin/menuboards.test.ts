import { afterEach, beforeEach, describe, expect, it } from "#test-compat";
import {
  createTestDbWithSetup,
  jsonResponse,
  loginAsAdmin,
  mockFormRequest,
  mockRequest,
  mockXiboFetch,
  resetDb,
  tokenResponse,
} from "#test-utils";
import { clearToken } from "#xibo/client.ts";
import { cacheInvalidateAll } from "#xibo/cache.ts";
import { updateXiboCredentials } from "#lib/db/settings.ts";
import type {
  XiboCategory,
  XiboMenuBoard,
  XiboProduct,
} from "#xibo/types.ts";

const BOARD: XiboMenuBoard = {
  menuId: 1,
  name: "Test Board",
  code: "TB",
  description: "A test board",
  modifiedDt: 1735689600,
};

const CATEGORY: XiboCategory = {
  menuCategoryId: 10,
  menuId: 1,
  name: "Starters",
  code: "ST",
  mediaId: null,
};

const PRODUCT: XiboProduct = {
  menuProductId: 100,
  menuCategoryId: 10,
  name: "Soup",
  price: "5.99",
  calories: "200",
  allergyInfo: "Gluten",
  availability: 1,
  description: "Tasty soup",
  mediaId: null,
};

/** Set up Xibo credentials in the test database */
const setupXiboCredentials = (): Promise<void> =>
  updateXiboCredentials("https://xibo.test", "test-id", "test-secret");

describe("admin/menuboards routes", () => {
  let cookie: string;
  let csrfToken: string;

  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
    clearToken();
    await cacheInvalidateAll();
    const login = await loginAsAdmin();
    cookie = login.cookie;
    csrfToken = login.csrfToken;
  });

  afterEach(() => {
    clearToken();
    resetDb();
  });

  describe("GET /admin/menuboards", () => {
    it("lists boards when Xibo is configured", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard"))
          return jsonResponse([BOARD]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest("/admin/menuboards", { headers: { cookie } }),
        );
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toContain("Menu Boards");
        expect(body).toContain("Test Board");
        expect(body).toContain("TB");
      } finally {
        mock.restore();
      }
    });

    it("shows empty state when no boards exist", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard")) return jsonResponse([]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest("/admin/menuboards", { headers: { cookie } }),
        );
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toContain("No menu boards found");
      } finally {
        mock.restore();
      }
    });

    it("redirects to settings when Xibo is not configured", async () => {
      const { handleRequest } = await import("#routes");
      const response = await handleRequest(
        mockRequest("/admin/menuboards", { headers: { cookie } }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("/admin/settings");
    });

    it("redirects to login when not authenticated", async () => {
      const { handleRequest } = await import("#routes");
      const response = await handleRequest(
        mockRequest("/admin/menuboards"),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    it("shows success message from query param", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard")) return jsonResponse([]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest("/admin/menuboards?success=Board+deleted", {
            headers: { cookie },
          }),
        );
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toContain("Board deleted");
      } finally {
        mock.restore();
      }
    });

    it("shows error when API call fails", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard"))
          return jsonResponse({ message: "Server Error" }, 500);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest("/admin/menuboards", { headers: { cookie } }),
        );
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toContain("API request failed");
      } finally {
        mock.restore();
      }
    });
  });

  describe("GET /admin/menuboard/new", () => {
    it("renders new board form", async () => {
      const { handleRequest } = await import("#routes");
      const response = await handleRequest(
        mockRequest("/admin/menuboard/new", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain("New Menu Board");
      expect(body).toContain('name="name"');
      expect(body).toContain('name="code"');
      expect(body).toContain('name="description"');
    });
  });

  describe("POST /admin/menuboard", () => {
    it("creates a new board and redirects", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url, init) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard") && init?.method === "POST")
          return jsonResponse({ ...BOARD, menuId: 5 });
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockFormRequest(
            "/admin/menuboard",
            {
              csrf_token: csrfToken,
              name: "New Board",
              code: "NB",
              description: "desc",
            },
            cookie,
          ),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toContain(
          "/admin/menuboard/5",
        );
      } finally {
        mock.restore();
      }
    });

    it("returns 400 when name is missing", async () => {
      await setupXiboCredentials();
      const { handleRequest } = await import("#routes");
      const response = await handleRequest(
        mockFormRequest(
          "/admin/menuboard",
          { csrf_token: csrfToken, code: "NB" },
          cookie,
        ),
      );
      expect(response.status).toBe(400);
      const body = await response.text();
      expect(body).toContain("required");
    });
  });

  describe("GET /admin/menuboard/:id", () => {
    it("renders board detail with categories and products", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard/1/categor"))
          return jsonResponse([CATEGORY]);
        if (url.includes("/api/menuboard/10/products"))
          return jsonResponse([PRODUCT]);
        if (url.includes("/api/menuboard"))
          return jsonResponse([BOARD]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest("/admin/menuboard/1", { headers: { cookie } }),
        );
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toContain("Test Board");
        expect(body).toContain("Starters");
        expect(body).toContain("Soup");
        expect(body).toContain("5.99");
      } finally {
        mock.restore();
      }
    });

    it("returns 404 when board not found", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard")) return jsonResponse([]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest("/admin/menuboard/999", { headers: { cookie } }),
        );
        expect(response.status).toBe(404);
      } finally {
        mock.restore();
      }
    });

    it("shows empty categories message", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard/1/categor"))
          return jsonResponse([]);
        if (url.includes("/api/menuboard"))
          return jsonResponse([BOARD]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest("/admin/menuboard/1", { headers: { cookie } }),
        );
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toContain("No categories yet");
      } finally {
        mock.restore();
      }
    });
  });

  describe("GET /admin/menuboard/:id/edit", () => {
    it("renders edit board form with pre-filled values", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard"))
          return jsonResponse([BOARD]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest("/admin/menuboard/1/edit", { headers: { cookie } }),
        );
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toContain("Edit Test Board");
      } finally {
        mock.restore();
      }
    });

    it("returns 404 when board not found", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard")) return jsonResponse([]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest("/admin/menuboard/999/edit", { headers: { cookie } }),
        );
        expect(response.status).toBe(404);
      } finally {
        mock.restore();
      }
    });
  });

  describe("POST /admin/menuboard/:id", () => {
    it("updates board and redirects", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url, init) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard/1") && init?.method === "PUT")
          return jsonResponse(BOARD);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockFormRequest(
            "/admin/menuboard/1",
            {
              csrf_token: csrfToken,
              name: "Updated Board",
              code: "UB",
              description: "updated",
            },
            cookie,
          ),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toContain(
          "/admin/menuboard/1",
        );
      } finally {
        mock.restore();
      }
    });

    it("returns 400 when name is missing", async () => {
      await setupXiboCredentials();
      const { handleRequest } = await import("#routes");
      const response = await handleRequest(
        mockFormRequest(
          "/admin/menuboard/1",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(400);
    });
  });

  describe("POST /admin/menuboard/:id/delete", () => {
    it("deletes board and redirects to list", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url, init) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard") && init?.method === "GET")
          return jsonResponse([BOARD]);
        if (url.includes("/api/menuboard/1") && init?.method === "DELETE")
          return new Response(null, { status: 204 });
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockFormRequest(
            "/admin/menuboard/1/delete",
            { csrf_token: csrfToken },
            cookie,
          ),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toContain(
          "/admin/menuboards",
        );
      } finally {
        mock.restore();
      }
    });
  });

  describe("category routes", () => {
    it("GET category/new renders form", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard"))
          return jsonResponse([BOARD]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest("/admin/menuboard/1/category/new", {
            headers: { cookie },
          }),
        );
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toContain("New Category");
      } finally {
        mock.restore();
      }
    });

    it("POST category creates and redirects", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url, init) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard/1/category") && init?.method === "POST")
          return jsonResponse(CATEGORY);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockFormRequest(
            "/admin/menuboard/1/category",
            { csrf_token: csrfToken, name: "Mains", code: "MN" },
            cookie,
          ),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toContain(
          "/admin/menuboard/1",
        );
      } finally {
        mock.restore();
      }
    });

    it("GET category edit renders form", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard/1/categories"))
          return jsonResponse([CATEGORY]);
        if (url.includes("/api/menuboard"))
          return jsonResponse([BOARD]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest("/admin/menuboard/1/category/10/edit", {
            headers: { cookie },
          }),
        );
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toContain("Edit Starters");
      } finally {
        mock.restore();
      }
    });

    it("POST category update redirects", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url, init) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard/10/category") && init?.method === "PUT")
          return jsonResponse(CATEGORY);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockFormRequest(
            "/admin/menuboard/1/category/10",
            { csrf_token: csrfToken, name: "Updated", code: "UC" },
            cookie,
          ),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toContain(
          "/admin/menuboard/1",
        );
      } finally {
        mock.restore();
      }
    });

    it("POST category delete redirects", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url, init) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (
          url.includes("/api/menuboard/10/category") &&
          init?.method === "DELETE"
        )
          return new Response(null, { status: 204 });
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockFormRequest(
            "/admin/menuboard/1/category/10/delete",
            { csrf_token: csrfToken },
            cookie,
          ),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toContain(
          "/admin/menuboard/1",
        );
      } finally {
        mock.restore();
      }
    });

    it("returns 400 when category name is missing", async () => {
      await setupXiboCredentials();
      const { handleRequest } = await import("#routes");
      const response = await handleRequest(
        mockFormRequest(
          "/admin/menuboard/1/category",
          { csrf_token: csrfToken, code: "X" },
          cookie,
        ),
      );
      expect(response.status).toBe(400);
    });

    it("returns 404 when board not found for category/new", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard")) return jsonResponse([]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest("/admin/menuboard/999/category/new", {
            headers: { cookie },
          }),
        );
        expect(response.status).toBe(404);
      } finally {
        mock.restore();
      }
    });

    it("returns 404 when category not found for edit", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard/1/categories"))
          return jsonResponse([]);
        if (url.includes("/api/menuboard"))
          return jsonResponse([BOARD]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest("/admin/menuboard/1/category/999/edit", {
            headers: { cookie },
          }),
        );
        expect(response.status).toBe(404);
      } finally {
        mock.restore();
      }
    });
  });

  describe("product routes", () => {
    it("GET product/new renders form", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard/1/categories"))
          return jsonResponse([CATEGORY]);
        if (url.includes("/api/menuboard"))
          return jsonResponse([BOARD]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest(
            "/admin/menuboard/1/category/10/product/new",
            { headers: { cookie } },
          ),
        );
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toContain("New Product");
        expect(body).toContain("Starters");
      } finally {
        mock.restore();
      }
    });

    it("POST product creates and redirects", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url, init) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (
          url.includes("/api/menuboard/10/product") &&
          init?.method === "POST"
        )
          return jsonResponse(PRODUCT);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockFormRequest(
            "/admin/menuboard/1/category/10/product",
            {
              csrf_token: csrfToken,
              name: "Burger",
              price: "12.99",
            },
            cookie,
          ),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toContain(
          "/admin/menuboard/1",
        );
      } finally {
        mock.restore();
      }
    });

    it("GET product edit renders form", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard/1/categor"))
          return jsonResponse([CATEGORY]);
        if (url.includes("/api/menuboard/10/products"))
          return jsonResponse([PRODUCT]);
        if (url.includes("/api/menuboard"))
          return jsonResponse([BOARD]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest(
            "/admin/menuboard/1/category/10/product/100/edit",
            { headers: { cookie } },
          ),
        );
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toContain("Edit Soup");
      } finally {
        mock.restore();
      }
    });

    it("POST product update redirects", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url, init) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (
          url.includes("/api/menuboard/100/product") &&
          init?.method === "PUT"
        )
          return jsonResponse(PRODUCT);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockFormRequest(
            "/admin/menuboard/1/category/10/product/100",
            {
              csrf_token: csrfToken,
              name: "Updated Soup",
              price: "6.99",
            },
            cookie,
          ),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toContain(
          "/admin/menuboard/1",
        );
      } finally {
        mock.restore();
      }
    });

    it("POST product delete redirects", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url, init) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (
          url.includes("/api/menuboard/100/product") &&
          init?.method === "DELETE"
        )
          return new Response(null, { status: 204 });
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockFormRequest(
            "/admin/menuboard/1/category/10/product/100/delete",
            { csrf_token: csrfToken },
            cookie,
          ),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toContain(
          "/admin/menuboard/1",
        );
      } finally {
        mock.restore();
      }
    });

    it("returns 400 when product name is missing", async () => {
      await setupXiboCredentials();
      const { handleRequest } = await import("#routes");
      const response = await handleRequest(
        mockFormRequest(
          "/admin/menuboard/1/category/10/product",
          { csrf_token: csrfToken, price: "5.00" },
          cookie,
        ),
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 when product price is missing", async () => {
      await setupXiboCredentials();
      const { handleRequest } = await import("#routes");
      const response = await handleRequest(
        mockFormRequest(
          "/admin/menuboard/1/category/10/product",
          { csrf_token: csrfToken, name: "Burger" },
          cookie,
        ),
      );
      expect(response.status).toBe(400);
    });

    it("returns 404 when product not found for edit", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard/1/categor"))
          return jsonResponse([CATEGORY]);
        if (url.includes("/api/menuboard/10/products"))
          return jsonResponse([]);
        if (url.includes("/api/menuboard"))
          return jsonResponse([BOARD]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest(
            "/admin/menuboard/1/category/10/product/999/edit",
            { headers: { cookie } },
          ),
        );
        expect(response.status).toBe(404);
      } finally {
        mock.restore();
      }
    });

    it("returns 404 when category not found for product/new", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard/1/categories"))
          return jsonResponse([]);
        if (url.includes("/api/menuboard"))
          return jsonResponse([BOARD]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest(
            "/admin/menuboard/1/category/999/product/new",
            { headers: { cookie } },
          ),
        );
        expect(response.status).toBe(404);
      } finally {
        mock.restore();
      }
    });
  });
});

describe("menuboard templates", () => {
  it("renders board list with action links", async () => {
    const { menuBoardListPage } = await import(
      "#templates/admin/menuboards.tsx"
    );
    const session = { csrfToken: "test", adminLevel: "owner" as const };
    const html = menuBoardListPage(session, [BOARD]);
    expect(html).toContain("Test Board");
    expect(html).toContain("/admin/menuboard/1");
    expect(html).toContain("/admin/menuboard/1/edit");
    expect(html).toContain("New Menu Board");
  });

  it("renders empty board list", async () => {
    const { menuBoardListPage } = await import(
      "#templates/admin/menuboards.tsx"
    );
    const session = { csrfToken: "test", adminLevel: "owner" as const };
    const html = menuBoardListPage(session, []);
    expect(html).toContain("No menu boards found");
  });

  it("renders board detail with tree view", async () => {
    const { menuBoardDetailPage } = await import(
      "#templates/admin/menuboards.tsx"
    );
    const session = { csrfToken: "test", adminLevel: "owner" as const };
    const html = menuBoardDetailPage(
      session,
      BOARD,
      [CATEGORY],
      { [CATEGORY.menuCategoryId]: [PRODUCT] },
    );
    expect(html).toContain("Test Board");
    expect(html).toContain("Starters");
    expect(html).toContain("Soup");
    expect(html).toContain("5.99");
    expect(html).toContain("Add Category");
    expect(html).toContain("Add Product");
    expect(html).toContain("Delete Board");
  });

  it("renders board detail with empty categories", async () => {
    const { menuBoardDetailPage } = await import(
      "#templates/admin/menuboards.tsx"
    );
    const session = { csrfToken: "test", adminLevel: "owner" as const };
    const html = menuBoardDetailPage(session, BOARD, [], {});
    expect(html).toContain("No categories yet");
  });

  it("renders new board form", async () => {
    const { menuBoardFormPage } = await import(
      "#templates/admin/menuboards.tsx"
    );
    const session = { csrfToken: "test", adminLevel: "owner" as const };
    const html = menuBoardFormPage(session);
    expect(html).toContain("New Menu Board");
    expect(html).toContain("Create");
    expect(html).toContain('action="/admin/menuboard"');
  });

  it("renders edit board form", async () => {
    const { menuBoardFormPage } = await import(
      "#templates/admin/menuboards.tsx"
    );
    const session = { csrfToken: "test", adminLevel: "owner" as const };
    const html = menuBoardFormPage(session, BOARD);
    expect(html).toContain("Edit Test Board");
    expect(html).toContain("Save Changes");
    expect(html).toContain('action="/admin/menuboard/1"');
  });

  it("renders category forms", async () => {
    const { categoryFormPage } = await import(
      "#templates/admin/menuboards.tsx"
    );
    const session = { csrfToken: "test", adminLevel: "owner" as const };
    const newHtml = categoryFormPage(session, 1, "Test Board");
    expect(newHtml).toContain("New Category");
    const editHtml = categoryFormPage(session, 1, "Test Board", CATEGORY);
    expect(editHtml).toContain("Edit Starters");
  });

  it("renders product forms", async () => {
    const { productFormPage } = await import(
      "#templates/admin/menuboards.tsx"
    );
    const session = { csrfToken: "test", adminLevel: "owner" as const };
    const newHtml = productFormPage(session, 1, "Test Board", 10, "Starters");
    expect(newHtml).toContain("New Product");
    expect(newHtml).toContain("Starters");
    const editHtml = productFormPage(
      session, 1, "Test Board", 10, "Starters", PRODUCT,
    );
    expect(editHtml).toContain("Edit Soup");
    expect(editHtml).toContain("5.99");
  });

  it("renders product availability status", async () => {
    const { menuBoardDetailPage } = await import(
      "#templates/admin/menuboards.tsx"
    );
    const session = { csrfToken: "test", adminLevel: "owner" as const };
    const unavailableProduct: XiboProduct = { ...PRODUCT, availability: 0 };
    const html = menuBoardDetailPage(
      session,
      BOARD,
      [CATEGORY],
      { [CATEGORY.menuCategoryId]: [PRODUCT, unavailableProduct] },
    );
    expect(html).toContain("Yes");
    expect(html).toContain("No");
  });
});

describe("admin/menuboards uncovered branches", () => {
  let cookie: string;
  let csrfToken: string;

  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
    clearToken();
    await cacheInvalidateAll();
    const login = await loginAsAdmin();
    cookie = login.cookie;
    csrfToken = login.csrfToken;
  });

  afterEach(() => {
    clearToken();
    resetDb();
  });

  describe("product fetched per category", () => {
    it("fetches products for each category separately", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard/1/categor"))
          return jsonResponse([CATEGORY]);
        if (url.includes("/api/menuboard/10/products"))
          return jsonResponse([PRODUCT]);
        if (url.includes("/api/menuboard"))
          return jsonResponse([BOARD]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest("/admin/menuboard/1", { headers: { cookie } }),
        );
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toContain("Soup");
      } finally {
        mock.restore();
      }
    });
  });

  describe("board list error catch (line 135)", () => {
    it("shows error message when fetch throws", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard"))
          throw new Error("Connection refused");
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest("/admin/menuboards", { headers: { cookie } }),
        );
        expect(response.status).toBe(200);
        const body = await response.text();
        // safeFetch wraps throw as XiboClientError("Failed to connect to Xibo CMS")
        expect(body).toContain("Failed to connect");
        expect(body).toContain("error");
      } finally {
        mock.restore();
      }
    });
  });

  describe("board create with empty optional fields (lines 164-165)", () => {
    it("creates a board without code or description", async () => {
      await setupXiboCredentials();
      let capturedBody: string | undefined;
      const mock = mockXiboFetch((url, init) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard") && init?.method === "POST") {
          capturedBody = init.body as string;
          return jsonResponse({ ...BOARD, menuId: 7 });
        }
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockFormRequest(
            "/admin/menuboard",
            { csrf_token: csrfToken, name: "Minimal Board" },
            cookie,
          ),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toContain(
          "/admin/menuboard/7",
        );
        expect(capturedBody).toBeDefined();
      } finally {
        mock.restore();
      }
    });
  });

  describe("board detail categories/products fetch error (lines 199-203)", () => {
    it("shows error when categories fetch throws", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard/1/categories"))
          throw new Error("Category fetch failed");
        if (url.includes("/api/menuboard"))
          return jsonResponse([BOARD]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest("/admin/menuboard/1", { headers: { cookie } }),
        );
        expect(response.status).toBe(200);
        const body = await response.text();
        // safeFetch wraps throw as XiboClientError - caught by error handler
        expect(body).toContain("Failed to connect");
        expect(body).toContain("error");
      } finally {
        mock.restore();
      }
    });

    it("shows error when categories endpoint returns 500", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard/1/categories"))
          return jsonResponse({ message: "Internal Error" }, 500);
        if (url.includes("/api/menuboard"))
          return jsonResponse([BOARD]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest("/admin/menuboard/1", { headers: { cookie } }),
        );
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toContain("API request failed");
        expect(body).toContain("error");
      } finally {
        mock.restore();
      }
    });
  });

  describe("board update with empty optional fields (lines 250-251)", () => {
    it("updates a board without code or description", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url, init) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard/1") && init?.method === "PUT")
          return jsonResponse(BOARD);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockFormRequest(
            "/admin/menuboard/1",
            { csrf_token: csrfToken, name: "Updated Board" },
            cookie,
          ),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toContain(
          "/admin/menuboard/1",
        );
      } finally {
        mock.restore();
      }
    });
  });

  describe("board delete when fetchBoard returns null (line 271)", () => {
    it("uses params.id as fallback name when board not found", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url, init) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard") && init?.method === "GET")
          return jsonResponse([]);
        if (url.includes("/api/menuboard/999") && init?.method === "DELETE")
          return new Response(null, { status: 204 });
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockFormRequest(
            "/admin/menuboard/999/delete",
            { csrf_token: csrfToken },
            cookie,
          ),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toContain(
          "/admin/menuboards",
        );
      } finally {
        mock.restore();
      }
    });
  });

  describe("category create with optional fields (lines 315, 317)", () => {
    it("creates category without code and with media_id", async () => {
      await setupXiboCredentials();
      let capturedBody: string | undefined;
      const mock = mockXiboFetch((url, init) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard/1/category") && init?.method === "POST") {
          capturedBody = init.body as string;
          return jsonResponse(CATEGORY);
        }
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockFormRequest(
            "/admin/menuboard/1/category",
            { csrf_token: csrfToken, name: "Desserts", media_id: "42" },
            cookie,
          ),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toContain(
          "/admin/menuboard/1",
        );
        expect(capturedBody).toContain("mediaId");
      } finally {
        mock.restore();
      }
    });

    it("creates category without code and without media_id", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url, init) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard/1/category") && init?.method === "POST")
          return jsonResponse(CATEGORY);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockFormRequest(
            "/admin/menuboard/1/category",
            { csrf_token: csrfToken, name: "Desserts" },
            cookie,
          ),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toContain(
          "/admin/menuboard/1",
        );
      } finally {
        mock.restore();
      }
    });
  });

  describe("category edit board not found (line 337)", () => {
    it("returns 404 when board not found for category edit", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard")) return jsonResponse([]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest("/admin/menuboard/999/category/10/edit", {
            headers: { cookie },
          }),
        );
        expect(response.status).toBe(404);
      } finally {
        mock.restore();
      }
    });
  });

  describe("category update validation error (line 362)", () => {
    it("returns 400 when category update name is missing", async () => {
      await setupXiboCredentials();
      const { handleRequest } = await import("#routes");
      const response = await handleRequest(
        mockFormRequest(
          "/admin/menuboard/1/category/10",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(400);
      const body = await response.text();
      expect(body).toContain("required");
    });
  });

  describe("category update with optional fields (lines 367, 369)", () => {
    it("updates category without code and with media_id", async () => {
      await setupXiboCredentials();
      let capturedBody: string | undefined;
      const mock = mockXiboFetch((url, init) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard/10/category") && init?.method === "PUT") {
          capturedBody = init.body as string;
          return jsonResponse(CATEGORY);
        }
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockFormRequest(
            "/admin/menuboard/1/category/10",
            { csrf_token: csrfToken, name: "Updated Cat", media_id: "55" },
            cookie,
          ),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toContain(
          "/admin/menuboard/1",
        );
        expect(capturedBody).toContain("mediaId");
      } finally {
        mock.restore();
      }
    });

    it("updates category without code and without media_id", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url, init) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard/10/category") && init?.method === "PUT")
          return jsonResponse(CATEGORY);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockFormRequest(
            "/admin/menuboard/1/category/10",
            { csrf_token: csrfToken, name: "Updated Cat" },
            cookie,
          ),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toContain(
          "/admin/menuboard/1",
        );
      } finally {
        mock.restore();
      }
    });
  });

  describe("product new board not found (line 420)", () => {
    it("returns 404 when board not found for product new", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard")) return jsonResponse([]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest(
            "/admin/menuboard/999/category/10/product/new",
            { headers: { cookie } },
          ),
        );
        expect(response.status).toBe(404);
      } finally {
        mock.restore();
      }
    });
  });

  describe("product create with optional fields (lines 458, 464)", () => {
    it("creates product without price fallback and with media_id", async () => {
      await setupXiboCredentials();
      let capturedBody: string | undefined;
      const mock = mockXiboFetch((url, init) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (
          url.includes("/api/menuboard/10/product") &&
          init?.method === "POST"
        ) {
          capturedBody = init.body as string;
          return jsonResponse(PRODUCT);
        }
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockFormRequest(
            "/admin/menuboard/1/category/10/product",
            {
              csrf_token: csrfToken,
              name: "Salad",
              price: "8.99",
              media_id: "77",
            },
            cookie,
          ),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toContain(
          "/admin/menuboard/1",
        );
        expect(capturedBody).toContain("mediaId");
      } finally {
        mock.restore();
      }
    });

    it("creates product with only required fields (price/description defaults)", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url, init) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (
          url.includes("/api/menuboard/10/product") &&
          init?.method === "POST"
        )
          return jsonResponse(PRODUCT);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockFormRequest(
            "/admin/menuboard/1/category/10/product",
            {
              csrf_token: csrfToken,
              name: "Salad",
              price: "8.99",
            },
            cookie,
          ),
        );
        expect(response.status).toBe(302);
      } finally {
        mock.restore();
      }
    });
  });

  describe("product edit board/category not found (lines 486, 490)", () => {
    it("returns 404 when board not found for product edit", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard")) return jsonResponse([]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest(
            "/admin/menuboard/999/category/10/product/100/edit",
            { headers: { cookie } },
          ),
        );
        expect(response.status).toBe(404);
      } finally {
        mock.restore();
      }
    });

    it("returns 404 when category not found for product edit", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (url.includes("/api/menuboard/1/categories"))
          return jsonResponse([]);
        if (url.includes("/api/menuboard"))
          return jsonResponse([BOARD]);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockRequest(
            "/admin/menuboard/1/category/999/product/100/edit",
            { headers: { cookie } },
          ),
        );
        expect(response.status).toBe(404);
      } finally {
        mock.restore();
      }
    });
  });

  describe("product update validation error (line 526)", () => {
    it("returns 400 when product update name is missing", async () => {
      await setupXiboCredentials();
      const { handleRequest } = await import("#routes");
      const response = await handleRequest(
        mockFormRequest(
          "/admin/menuboard/1/category/10/product/100",
          { csrf_token: csrfToken, price: "5.00" },
          cookie,
        ),
      );
      expect(response.status).toBe(400);
      const body = await response.text();
      expect(body).toContain("required");
    });
  });

  describe("product update with optional fields (lines 533, 539)", () => {
    it("updates product with media_id", async () => {
      await setupXiboCredentials();
      let capturedBody: string | undefined;
      const mock = mockXiboFetch((url, init) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (
          url.includes("/api/menuboard/100/product") &&
          init?.method === "PUT"
        ) {
          capturedBody = init.body as string;
          return jsonResponse(PRODUCT);
        }
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockFormRequest(
            "/admin/menuboard/1/category/10/product/100",
            {
              csrf_token: csrfToken,
              name: "Updated Soup",
              price: "6.99",
              media_id: "88",
            },
            cookie,
          ),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toContain(
          "/admin/menuboard/1",
        );
        expect(capturedBody).toContain("mediaId");
      } finally {
        mock.restore();
      }
    });

    it("updates product without optional fields (price/description defaults)", async () => {
      await setupXiboCredentials();
      const mock = mockXiboFetch((url, init) => {
        if (url.includes("/api/authorize/access_token"))
          return tokenResponse();
        if (
          url.includes("/api/menuboard/100/product") &&
          init?.method === "PUT"
        )
          return jsonResponse(PRODUCT);
        return null;
      });
      try {
        const { handleRequest } = await import("#routes");
        const response = await handleRequest(
          mockFormRequest(
            "/admin/menuboard/1/category/10/product/100",
            {
              csrf_token: csrfToken,
              name: "Updated Soup",
              price: "6.99",
            },
            cookie,
          ),
        );
        expect(response.status).toBe(302);
      } finally {
        mock.restore();
      }
    });
  });
});

describe("menuboard detail template success/error divs (lines 96-97)", () => {
  it("renders success div in board detail page", async () => {
    const { menuBoardDetailPage } = await import(
      "#templates/admin/menuboards.tsx"
    );
    const session = { csrfToken: "test", adminLevel: "owner" as const };
    const html = menuBoardDetailPage(
      session,
      BOARD,
      [CATEGORY],
      { [CATEGORY.menuCategoryId]: [PRODUCT] },
      "Board updated successfully",
    );
    expect(html).toContain('<div class="success">Board updated successfully</div>');
  });

  it("renders error div in board detail page", async () => {
    const { menuBoardDetailPage } = await import(
      "#templates/admin/menuboards.tsx"
    );
    const session = { csrfToken: "test", adminLevel: "owner" as const };
    const html = menuBoardDetailPage(
      session,
      BOARD,
      [],
      {},
      undefined,
      "Something went wrong",
    );
    expect(html).toContain('<div class="error">Something went wrong</div>');
  });
});

describe("menuboard detail template category with no products (line 169)", () => {
  it("renders empty product list when category has no products in map", async () => {
    const { menuBoardDetailPage } = await import(
      "#templates/admin/menuboards.tsx"
    );
    const session = { csrfToken: "test", adminLevel: "owner" as const };
    const emptyCategory: XiboCategory = {
      menuCategoryId: 20,
      menuId: 1,
      name: "Empty Cat",
      code: "EC",
      mediaId: null,
    };
    const html = menuBoardDetailPage(
      session,
      BOARD,
      [emptyCategory],
      {},
    );
    expect(html).toContain("Empty Cat");
    expect(html).toContain("No products in this category");
  });
});

describe("menuboard field definitions", () => {
  it("exports menuBoardFields with correct structure", async () => {
    const { menuBoardFields } = await import("#templates/fields.ts");
    expect(menuBoardFields.length).toBe(3);
    expect(menuBoardFields[0]!.name).toBe("name");
    expect(menuBoardFields[0]!.required).toBe(true);
    expect(menuBoardFields[1]!.name).toBe("code");
    expect(menuBoardFields[2]!.name).toBe("description");
    expect(menuBoardFields[2]!.type).toBe("textarea");
  });

  it("exports categoryFields with correct structure", async () => {
    const { categoryFields } = await import("#templates/fields.ts");
    expect(categoryFields.length).toBe(3);
    expect(categoryFields[0]!.name).toBe("name");
    expect(categoryFields[0]!.required).toBe(true);
  });

  it("exports productFields with correct structure", async () => {
    const { productFields } = await import("#templates/fields.ts");
    expect(productFields.length).toBe(7);
    expect(productFields[0]!.name).toBe("name");
    expect(productFields[0]!.required).toBe(true);
    expect(productFields[2]!.name).toBe("price");
    expect(productFields[2]!.required).toBe(true);
  });
});
