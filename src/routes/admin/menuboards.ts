/**
 * Admin menu board routes — CRUD for boards, categories, and products
 */

import { logActivity } from "#lib/db/activityLog.ts";
import { validateForm } from "#lib/forms.tsx";
import { loadXiboConfig, get, post, put, del } from "#xibo/client.ts";
import type {
  XiboCategory,
  XiboConfig,
  XiboMenuBoard,
  XiboProduct,
} from "#xibo/types.ts";
import { defineRoutes } from "#routes/router.ts";
import {
  htmlResponse,
  redirect,
  redirectWithSuccess,
  requireSessionOr,
  withAuthForm,
} from "#routes/utils.ts";
import {
  categoryFields,
  type CategoryFormValues,
  menuBoardFields,
  type MenuBoardFormValues,
  productFields,
  type ProductFormValues,
} from "#templates/fields.ts";
import {
  categoryFormPage,
  menuBoardDetailPage,
  menuBoardFormPage,
  menuBoardListPage,
  productFormPage,
} from "#templates/admin/menuboards.tsx";

/**
 * Helper: load Xibo config or return an error response
 */
const withXiboConfig = async (
  handler: (config: XiboConfig) => Promise<Response>,
): Promise<Response> => {
  const config = await loadXiboConfig();
  if (!config) {
    return redirect("/admin/settings?success=" + encodeURIComponent("Configure Xibo API credentials first"));
  }
  return handler(config);
};

/**
 * Fetch a board by ID, return null if not found
 */
const fetchBoard = async (
  config: XiboConfig,
  boardId: string,
): Promise<XiboMenuBoard | null> => {
  const boards = await get<XiboMenuBoard[]>(config, "menuboards", {
    menuId: boardId,
  });
  return boards[0] ?? null;
};

/**
 * Fetch categories for a board
 */
const fetchCategories = (
  config: XiboConfig,
  menuId: number,
): Promise<XiboCategory[]> =>
  get<XiboCategory[]>(config, `menuboard/${menuId}/categories`);

/**
 * Fetch products for a board grouped by category
 */
const fetchProductsByCategory = async (
  config: XiboConfig,
  categories: XiboCategory[],
): Promise<Record<number, XiboProduct[]>> => {
  const grouped: Record<number, XiboProduct[]> = {};
  await Promise.all(
    categories.map(async (cat) => {
      grouped[cat.menuCategoryId] = await get<XiboProduct[]>(
        config,
        `menuboard/${cat.menuCategoryId}/products`,
      );
    }),
  );
  return grouped;
};

/**
 * Find a single category by ID within a list
 */
const findCategory = (
  categories: XiboCategory[],
  categoryId: string,
): XiboCategory | undefined =>
  categories.find((c) => String(c.menuCategoryId) === categoryId);

/**
 * Find a single product by ID within a products map
 */
const findProduct = (
  productsByCategory: Record<number, XiboProduct[]>,
  productId: string,
): XiboProduct | undefined => {
  for (const products of Object.values(productsByCategory)) {
    const found = products.find((p) => String(p.menuProductId) === productId);
    if (found) return found;
  }
  return undefined;
};

// ─── Board Routes ────────────────────────────────────────────────────

/**
 * GET /admin/menuboards — list all boards
 */
const handleBoardList = (request: Request): Promise<Response> =>
  requireSessionOr(request, (session) =>
    withXiboConfig(async (config) => {
      const url = new URL(request.url);
      const success = url.searchParams.get("success") || undefined;
      let boards: XiboMenuBoard[] = [];
      let error: string | undefined;
      try {
        boards = await get<XiboMenuBoard[]>(config, "menuboards");
      } catch (e) {
        error = (e as Error).message;
      }
      return htmlResponse(menuBoardListPage(session, boards, success, error));
    }),
  );

/**
 * GET /admin/menuboard/new — new board form
 */
const handleBoardNew = (request: Request): Promise<Response> =>
  requireSessionOr(request, (session) =>
    Promise.resolve(htmlResponse(menuBoardFormPage(session))),
  );

/**
 * POST /admin/menuboard — create board
 */
const handleBoardCreate = (request: Request): Promise<Response> =>
  withAuthForm(request, (_session, form) =>
    withXiboConfig(async (config) => {
      const validation = validateForm<MenuBoardFormValues>(
        form,
        menuBoardFields,
      );
      if (!validation.valid) return htmlResponse(validation.error, 400);

      const { name, code, description } = validation.values;
      const created = await post<XiboMenuBoard>(config, "menuboard", {
        name,
        code: code ?? "",
        description: description ?? "",
      });
      await logActivity(`Created menu board "${name}"`);
      return redirectWithSuccess(
        `/admin/menuboard/${created.menuId}`,
        "Menu board created",
      );
    }),
  );

/**
 * GET /admin/menuboard/:id — view board detail
 */
const handleBoardDetail = (
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> =>
  requireSessionOr(request, (session) =>
    withXiboConfig(async (config) => {
      const board = await fetchBoard(config, params.id!);
      if (!board) return htmlResponse("Menu board not found", 404);

      const url = new URL(request.url);
      const success = url.searchParams.get("success") || undefined;
      let categories: XiboCategory[] = [];
      let productsByCategory: Record<number, XiboProduct[]> = {};
      let error: string | undefined;
      try {
        categories = await fetchCategories(config, board.menuId);
        productsByCategory = await fetchProductsByCategory(
          config,
          categories,
        );
      } catch (e) {
        error = (e as Error).message;
      }
      return htmlResponse(
        menuBoardDetailPage(
          session,
          board,
          categories,
          productsByCategory,
          success,
          error,
        ),
      );
    }),
  );

/**
 * GET /admin/menuboard/:id/edit — edit board form
 */
const handleBoardEdit = (
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> =>
  requireSessionOr(request, (session) =>
    withXiboConfig(async (config) => {
      const board = await fetchBoard(config, params.id!);
      if (!board) return htmlResponse("Menu board not found", 404);
      return htmlResponse(menuBoardFormPage(session, board));
    }),
  );

/**
 * POST /admin/menuboard/:id — update board
 */
const handleBoardUpdate = (
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> =>
  withAuthForm(request, (_session, form) =>
    withXiboConfig(async (config) => {
      const validation = validateForm<MenuBoardFormValues>(
        form,
        menuBoardFields,
      );
      if (!validation.valid) return htmlResponse(validation.error, 400);

      const { name, code, description } = validation.values;
      await put(config, `menuboard/${params.id}`, {
        name,
        code: code ?? "",
        description: description ?? "",
      });
      await logActivity(`Updated menu board "${name}"`);
      return redirectWithSuccess(
        `/admin/menuboard/${params.id}`,
        "Menu board updated",
      );
    }),
  );

/**
 * POST /admin/menuboard/:id/delete — delete board
 */
const handleBoardDelete = (
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> =>
  withAuthForm(request, (_session, _form) =>
    withXiboConfig(async (config) => {
      const board = await fetchBoard(config, params.id!);
      const name = board?.name ?? params.id;
      await del(config, `menuboard/${params.id}`);
      await logActivity(`Deleted menu board "${name}"`);
      return redirectWithSuccess("/admin/menuboards", "Menu board deleted");
    }),
  );

// ─── Category Routes ────────────────────────────────────────────────

/**
 * GET /admin/menuboard/:boardId/category/new — new category form
 */
const handleCategoryNew = (
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> =>
  requireSessionOr(request, (session) =>
    withXiboConfig(async (config) => {
      const board = await fetchBoard(config, params.boardId!);
      if (!board) return htmlResponse("Menu board not found", 404);
      return htmlResponse(
        categoryFormPage(session, board.menuId, board.name),
      );
    }),
  );

/**
 * POST /admin/menuboard/:boardId/category — create category
 */
const handleCategoryCreate = (
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> =>
  withAuthForm(request, (_session, form) =>
    withXiboConfig(async (config) => {
      const validation = validateForm<CategoryFormValues>(
        form,
        categoryFields,
      );
      if (!validation.valid) return htmlResponse(validation.error, 400);

      const { name, code, media_id } = validation.values;
      const body: Record<string, unknown> = {
        name,
        code: code ?? "",
      };
      if (media_id) body.mediaId = media_id;
      await post(config, `menuboard/${params.boardId}/category`, body);
      await logActivity(`Created category "${name}" in board ${params.boardId}`);
      return redirectWithSuccess(
        `/admin/menuboard/${params.boardId}`,
        "Category created",
      );
    }),
  );

/**
 * GET /admin/menuboard/:boardId/category/:id/edit — edit category form
 */
const handleCategoryEdit = (
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> =>
  requireSessionOr(request, (session) =>
    withXiboConfig(async (config) => {
      const board = await fetchBoard(config, params.boardId!);
      if (!board) return htmlResponse("Menu board not found", 404);

      const categories = await fetchCategories(config, board.menuId);
      const category = findCategory(categories, params.id!);
      if (!category) return htmlResponse("Category not found", 404);

      return htmlResponse(
        categoryFormPage(session, board.menuId, board.name, category),
      );
    }),
  );

/**
 * POST /admin/menuboard/:boardId/category/:id — update category
 */
const handleCategoryUpdate = (
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> =>
  withAuthForm(request, (_session, form) =>
    withXiboConfig(async (config) => {
      const validation = validateForm<CategoryFormValues>(
        form,
        categoryFields,
      );
      if (!validation.valid) return htmlResponse(validation.error, 400);

      const { name, code, media_id } = validation.values;
      const body: Record<string, unknown> = {
        name,
        code: code ?? "",
      };
      if (media_id) body.mediaId = media_id;
      await put(
        config,
        `menuboard/${params.id}/category`,
        body,
      );
      await logActivity(
        `Updated category "${name}" in board ${params.boardId}`,
      );
      return redirectWithSuccess(
        `/admin/menuboard/${params.boardId}`,
        "Category updated",
      );
    }),
  );

/**
 * POST /admin/menuboard/:boardId/category/:id/delete — delete category
 */
const handleCategoryDelete = (
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> =>
  withAuthForm(request, (_session, _form) =>
    withXiboConfig(async (config) => {
      await del(
        config,
        `menuboard/${params.id}/category`,
      );
      await logActivity(
        `Deleted category ${params.id} from board ${params.boardId}`,
      );
      return redirectWithSuccess(
        `/admin/menuboard/${params.boardId}`,
        "Category deleted",
      );
    }),
  );

// ─── Product Routes ──────────────────────────────────────────────────

/**
 * GET /admin/menuboard/:boardId/category/:catId/product/new — new product form
 */
const handleProductNew = (
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> =>
  requireSessionOr(request, (session) =>
    withXiboConfig(async (config) => {
      const board = await fetchBoard(config, params.boardId!);
      if (!board) return htmlResponse("Menu board not found", 404);

      const categories = await fetchCategories(config, board.menuId);
      const category = findCategory(categories, params.catId!);
      if (!category) return htmlResponse("Category not found", 404);

      return htmlResponse(
        productFormPage(
          session,
          board.menuId,
          board.name,
          category.menuCategoryId,
          category.name,
        ),
      );
    }),
  );

/**
 * POST /admin/menuboard/:boardId/category/:catId/product — create product
 */
const handleProductCreate = (
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> =>
  withAuthForm(request, (_session, form) =>
    withXiboConfig(async (config) => {
      const validation = validateForm<ProductFormValues>(
        form,
        productFields,
      );
      if (!validation.valid) return htmlResponse(validation.error, 400);

      const { name, description, price, calories, allergy_info, availability, media_id } =
        validation.values;
      const body: Record<string, unknown> = {
        menuCategoryId: Number(params.catId),
        name,
        price,
        description: description ?? "",
        calories: calories ?? "",
        allergyInfo: allergy_info ?? "",
        availability: availability ?? 1,
      };
      if (media_id) body.mediaId = media_id;
      await post(config, `menuboard/${params.catId}/product`, body);
      await logActivity(
        `Created product "${name}" in category ${params.catId}`,
      );
      return redirectWithSuccess(
        `/admin/menuboard/${params.boardId}`,
        "Product created",
      );
    }),
  );

/**
 * GET /admin/menuboard/:boardId/category/:catId/product/:id/edit — edit product form
 */
const handleProductEdit = (
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> =>
  requireSessionOr(request, (session) =>
    withXiboConfig(async (config) => {
      const board = await fetchBoard(config, params.boardId!);
      if (!board) return htmlResponse("Menu board not found", 404);

      const categories = await fetchCategories(config, board.menuId);
      const category = findCategory(categories, params.catId!);
      if (!category) return htmlResponse("Category not found", 404);

      const productsByCategory = await fetchProductsByCategory(
        config,
        categories,
      );
      const product = findProduct(productsByCategory, params.id!);
      if (!product) return htmlResponse("Product not found", 404);

      return htmlResponse(
        productFormPage(
          session,
          board.menuId,
          board.name,
          category.menuCategoryId,
          category.name,
          product,
        ),
      );
    }),
  );

/**
 * POST /admin/menuboard/:boardId/category/:catId/product/:id — update product
 */
const handleProductUpdate = (
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> =>
  withAuthForm(request, (_session, form) =>
    withXiboConfig(async (config) => {
      const validation = validateForm<ProductFormValues>(
        form,
        productFields,
      );
      if (!validation.valid) return htmlResponse(validation.error, 400);

      const { name, description, price, calories, allergy_info, availability, media_id } =
        validation.values;
      const body: Record<string, unknown> = {
        menuCategoryId: Number(params.catId),
        name,
        price,
        description: description ?? "",
        calories: calories ?? "",
        allergyInfo: allergy_info ?? "",
        availability: availability ?? 1,
      };
      if (media_id) body.mediaId = media_id;
      await put(
        config,
        `menuboard/${params.id}/product`,
        body,
      );
      await logActivity(
        `Updated product "${name}" in category ${params.catId}`,
      );
      return redirectWithSuccess(
        `/admin/menuboard/${params.boardId}`,
        "Product updated",
      );
    }),
  );

/**
 * POST /admin/menuboard/:boardId/category/:catId/product/:id/delete — delete product
 */
const handleProductDelete = (
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> =>
  withAuthForm(request, (_session, _form) =>
    withXiboConfig(async (config) => {
      await del(
        config,
        `menuboard/${params.id}/product`,
      );
      await logActivity(
        `Deleted product ${params.id} from board ${params.boardId}`,
      );
      return redirectWithSuccess(
        `/admin/menuboard/${params.boardId}`,
        "Product deleted",
      );
    }),
  );

// ─── Route Definitions ──────────────────────────────────────────────

/** Menu board routes */
export const menuBoardRoutes = defineRoutes({
  // Boards
  "GET /admin/menuboards": (request) => handleBoardList(request),
  "GET /admin/menuboard/new": (request) => handleBoardNew(request),
  "POST /admin/menuboard": (request) => handleBoardCreate(request),
  "GET /admin/menuboard/:id": (request, params) =>
    handleBoardDetail(request, params),
  "GET /admin/menuboard/:id/edit": (request, params) =>
    handleBoardEdit(request, params),
  "POST /admin/menuboard/:id": (request, params) =>
    handleBoardUpdate(request, params),
  "POST /admin/menuboard/:id/delete": (request, params) =>
    handleBoardDelete(request, params),

  // Categories
  "GET /admin/menuboard/:boardId/category/new": (request, params) =>
    handleCategoryNew(request, params),
  "POST /admin/menuboard/:boardId/category": (request, params) =>
    handleCategoryCreate(request, params),
  "GET /admin/menuboard/:boardId/category/:id/edit": (request, params) =>
    handleCategoryEdit(request, params),
  "POST /admin/menuboard/:boardId/category/:id": (request, params) =>
    handleCategoryUpdate(request, params),
  "POST /admin/menuboard/:boardId/category/:id/delete": (request, params) =>
    handleCategoryDelete(request, params),

  // Products
  "GET /admin/menuboard/:boardId/category/:catId/product/new":
    (request, params) => handleProductNew(request, params),
  "POST /admin/menuboard/:boardId/category/:catId/product":
    (request, params) => handleProductCreate(request, params),
  "GET /admin/menuboard/:boardId/category/:catId/product/:id/edit":
    (request, params) => handleProductEdit(request, params),
  "POST /admin/menuboard/:boardId/category/:catId/product/:id":
    (request, params) => handleProductUpdate(request, params),
  "POST /admin/menuboard/:boardId/category/:catId/product/:id/delete":
    (request, params) => handleProductDelete(request, params),
});
