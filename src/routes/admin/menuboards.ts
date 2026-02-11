/**
 * Admin menu board routes — CRUD for boards, categories, and products
 */

import { groupBy, reduce } from "#fp";
import { logActivity } from "#lib/db/activityLog.ts";
import { get, post, put, del } from "#xibo/client.ts";
import type {
  XiboCategory,
  XiboConfig,
  XiboMenuBoard,
  XiboProduct,
} from "#xibo/types.ts";
import { defineRoutes } from "#routes/router.ts";
import type { AuthSession } from "#routes/utils.ts";
import {
  htmlResponse,
  redirectWithSuccess,
  requireSessionOr,
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
import {
  detailRoute,
  errorMessage,
  formRouteP,
  getSuccessParam,
  listRoute,
} from "#routes/admin/utils.ts";

// ─── Data Helpers ────────────────────────────────────────────────────

/**
 * Fetch categories for a board
 */
const fetchCategories = (
  config: XiboConfig,
  boardId: number,
): Promise<XiboCategory[]> =>
  get<XiboCategory[]>(config, `menuboard/${boardId}/category`);

/**
 * Fetch products for a board grouped by category
 */
const fetchProductsByCategory = async (
  config: XiboConfig,
  boardId: number,
  categories: XiboCategory[],
): Promise<Record<number, XiboProduct[]>> => {
  const products = await get<XiboProduct[]>(
    config,
    `menuboard/${boardId}/product`,
  );
  const byCategory = groupBy(
    (p: XiboProduct) => String(p.menuCategoryId),
  )(products);
  // Seed with empty arrays for known categories, then overlay grouped products
  const result = reduce(
    (acc: Record<number, XiboProduct[]>, cat: XiboCategory) => {
      acc[cat.menuCategoryId] =
        byCategory[String(cat.menuCategoryId)] ?? [];
      return acc;
    },
    {} as Record<number, XiboProduct[]>,
  )(categories);
  // Preserve products from unknown categories
  for (const [key, prods] of Object.entries(byCategory)) {
    const id = Number(key);
    if (!result[id]) result[id] = prods;
  }
  return result;
};

/**
 * Find a single product by ID within a products map
 */
const findProduct = (
  productsByCategory: Record<number, XiboProduct[]>,
  productId: string,
): XiboProduct | undefined =>
  Object.values(productsByCategory)
    .flat()
    .find((p) => String(p.menuProductId) === productId);

// ─── Guard Helpers ───────────────────────────────────────────────────

/**
 * Fetch a board by ID, calling handler if found or returning 404.
 */
const withBoard = async (
  config: XiboConfig,
  boardId: string,
  handler: (board: XiboMenuBoard) => Promise<Response>,
): Promise<Response> => {
  const boards = await get<XiboMenuBoard[]>(config, "menuboard", {
    menuBoardId: boardId,
  });
  const board = boards[0];
  if (!board) return htmlResponse("Menu board not found", 404);
  return handler(board);
};

/**
 * Fetch a board + find a category within it, or return 404.
 */
const withBoardCategory = (
  config: XiboConfig,
  boardId: string,
  categoryId: string,
  handler: (
    board: XiboMenuBoard,
    category: XiboCategory,
    categories: XiboCategory[],
  ) => Promise<Response>,
): Promise<Response> =>
  withBoard(config, boardId, async (board) => {
    const categories = await fetchCategories(config, board.menuBoardId);
    const category = categories.find(
      (c) => String(c.menuCategoryId) === categoryId,
    );
    if (!category) return htmlResponse("Category not found", 404);
    return handler(board, category, categories);
  });

// ─── Route Composition Helpers ──────────────────────────────────────

/** Route that fetches a board by param name, provides session+config+board */
const boardRoute = (
  paramName: string,
  handler: (
    session: AuthSession,
    config: XiboConfig,
    board: XiboMenuBoard,
    request: Request,
  ) => Promise<Response>,
) =>
  detailRoute(async (session, config, params, request) =>
    withBoard(config, params[paramName]!, (board) =>
      handler(session, config, board, request)),
  );

/** Route that fetches board + category, provides all entities + params */
const boardCategoryRoute = (
  catParam: string,
  handler: (
    session: AuthSession,
    config: XiboConfig,
    board: XiboMenuBoard,
    category: XiboCategory,
    categories: XiboCategory[],
    params: Record<string, string | undefined>,
  ) => Promise<Response>,
) =>
  detailRoute(async (session, config, params) =>
    withBoardCategory(config, params.boardId!, params[catParam]!,
      (board, category, categories) =>
        handler(session, config, board, category, categories, params)),
  );

/** Delete a board child entity (category or product) with activity logging */
const deleteBoardChild = (
  entity: string,
  subpath: string,
) =>
  formRouteP<Record<string, never>>(
    [],
    async (_values, config, params) => {
      await del(
        config,
        `menuboard/${params.boardId}/${subpath}/${params.id}`,
      );
      await logActivity(
        `Deleted ${entity} ${params.id} from board ${params.boardId}`,
      );
      return redirectWithSuccess(
        `/admin/menuboard/${params.boardId}`,
        `${entity[0].toUpperCase()}${entity.slice(1)} deleted`,
      );
    },
  );

/** Log an activity and redirect back to the board detail page. */
const logAndRedirectToBoard = async (
  boardId: string,
  logMsg: string,
  successMsg: string,
): Promise<Response> => {
  await logActivity(logMsg);
  return redirectWithSuccess(`/admin/menuboard/${boardId}`, successMsg);
};

// ─── Body Builders ──────────────────────────────────────────────────

/** Build the API body for a board create/update */
const buildBoardBody = (
  values: MenuBoardFormValues,
): Record<string, unknown> => ({
  name: values.name,
  code: values.code ?? "",
  description: values.description ?? "",
});

/** Build the API body for a category create/update */
const buildCategoryBody = (
  values: CategoryFormValues,
): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    name: values.name,
    code: values.code ?? "",
  };
  if (values.media_id) body.mediaId = values.media_id;
  return body;
};

/** Build the API body for a product create/update */
const buildProductBody = (
  catId: string,
  values: ProductFormValues,
): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    menuCategoryId: Number(catId),
    name: values.name,
    price: values.price,
    description: values.description ?? "",
    calories: values.calories ?? "",
    allergyInfo: values.allergy_info ?? "",
    availability: values.availability ?? 1,
  };
  if (values.media_id) body.mediaId = values.media_id;
  return body;
};

// ─── Board Routes ────────────────────────────────────────────────────

/** GET /admin/menuboards — list all boards */
const handleBoardList = listRoute<XiboMenuBoard>(
  "menuboard",
  menuBoardListPage,
);

/** GET /admin/menuboard/new — new board form */
const handleBoardNew = (request: Request): Promise<Response> =>
  requireSessionOr(request, (session) =>
    Promise.resolve(htmlResponse(menuBoardFormPage(session))),
  );

/** POST /admin/menuboard — create board */
const handleBoardCreate = formRouteP<MenuBoardFormValues>(
  menuBoardFields,
  async (values, config) => {
    const created = await post<XiboMenuBoard>(
      config,
      "menuboard",
      buildBoardBody(values),
    );
    await logActivity(`Created menu board "${values.name}"`);
    return redirectWithSuccess(
      `/admin/menuboard/${created.menuBoardId}`,
      "Menu board created",
    );
  },
);

/** GET /admin/menuboard/:id — view board detail */
const handleBoardDetail = boardRoute(
  "id",
  async (session, config, board, request) => {
    const success = getSuccessParam(request);
    let categories: XiboCategory[] = [];
    let productsByCategory: Record<number, XiboProduct[]> = {};
    let error: string | undefined;
    try {
      categories = await fetchCategories(config, board.menuBoardId);
      productsByCategory = await fetchProductsByCategory(
        config,
        board.menuBoardId,
        categories,
      );
    } catch (e) {
      error = errorMessage(e);
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
  },
);

/** GET /admin/menuboard/:id/edit — edit board form */
const handleBoardEdit = boardRoute(
  "id",
  async (session, _config, board) =>
    htmlResponse(menuBoardFormPage(session, board)),
);

/** POST /admin/menuboard/:id — update board */
const handleBoardUpdate = formRouteP<MenuBoardFormValues>(
  menuBoardFields,
  async (values, config, params) => {
    await put(config, `menuboard/${params.id}`, buildBoardBody(values));
    await logActivity(`Updated menu board "${values.name}"`);
    return redirectWithSuccess(
      `/admin/menuboard/${params.id}`,
      "Menu board updated",
    );
  },
);

/** POST /admin/menuboard/:id/delete — delete board */
const handleBoardDelete = formRouteP<Record<string, never>>(
  [],
  async (_values, config, params) => {
    const boards = await get<XiboMenuBoard[]>(config, "menuboard", {
      menuBoardId: params.id!,
    });
    const name = boards[0]?.name ?? params.id;
    await del(config, `menuboard/${params.id}`);
    await logActivity(`Deleted menu board "${name}"`);
    return redirectWithSuccess("/admin/menuboards", "Menu board deleted");
  },
);

// ─── Category Routes ────────────────────────────────────────────────

/** GET /admin/menuboard/:boardId/category/new — new category form */
const handleCategoryNew = boardRoute(
  "boardId",
  async (session, _config, board) =>
    htmlResponse(
      categoryFormPage(session, board.menuBoardId, board.name),
    ),
);

/** POST /admin/menuboard/:boardId/category — create category */
const handleCategoryCreate = formRouteP<CategoryFormValues>(
  categoryFields,
  async (values, config, params) => {
    await post(
      config,
      `menuboard/${params.boardId}/category`,
      buildCategoryBody(values),
    );
    return logAndRedirectToBoard(
      params.boardId!,
      `Created category "${values.name}" in board ${params.boardId}`,
      "Category created",
    );
  },
);

/** GET /admin/menuboard/:boardId/category/:id/edit — edit category form */
const handleCategoryEdit = boardCategoryRoute(
  "id",
  async (session, _config, board, category, _categories, _params) =>
    htmlResponse(
      categoryFormPage(
        session,
        board.menuBoardId,
        board.name,
        category,
      ),
    ),
);

/** POST /admin/menuboard/:boardId/category/:id — update category */
const handleCategoryUpdate = formRouteP<CategoryFormValues>(
  categoryFields,
  async (values, config, params) => {
    await put(
      config,
      `menuboard/${params.boardId}/category/${params.id}`,
      buildCategoryBody(values),
    );
    return logAndRedirectToBoard(
      params.boardId!,
      `Updated category "${values.name}" in board ${params.boardId}`,
      "Category updated",
    );
  },
);

/** POST /admin/menuboard/:boardId/category/:id/delete — delete category */
const handleCategoryDelete = deleteBoardChild("category", "category");

// ─── Product Routes ──────────────────────────────────────────────────

/** GET /admin/menuboard/:boardId/category/:catId/product/new — new product form */
const handleProductNew = boardCategoryRoute(
  "catId",
  async (session, _config, board, category, _categories, _params) =>
    htmlResponse(
      productFormPage(
        session,
        board.menuBoardId,
        board.name,
        category.menuCategoryId,
        category.name,
      ),
    ),
);

/** POST /admin/menuboard/:boardId/category/:catId/product — create product */
const handleProductCreate = formRouteP<ProductFormValues>(
  productFields,
  async (values, config, params) => {
    await post(
      config,
      `menuboard/${params.boardId}/product`,
      buildProductBody(params.catId!, values),
    );
    return logAndRedirectToBoard(
      params.boardId!,
      `Created product "${values.name}" in category ${params.catId}`,
      "Product created",
    );
  },
);

/** GET /admin/menuboard/:boardId/category/:catId/product/:id/edit — edit product form */
const handleProductEdit = boardCategoryRoute(
  "catId",
  async (session, config, board, category, categories, params) => {
    const productsByCategory = await fetchProductsByCategory(
      config,
      board.menuBoardId,
      categories,
    );
    const product = findProduct(productsByCategory, params.id!);
    if (!product) return htmlResponse("Product not found", 404);

    return htmlResponse(
      productFormPage(
        session,
        board.menuBoardId,
        board.name,
        category.menuCategoryId,
        category.name,
        product,
      ),
    );
  },
);

/** POST /admin/menuboard/:boardId/category/:catId/product/:id — update product */
const handleProductUpdate = formRouteP<ProductFormValues>(
  productFields,
  async (values, config, params) => {
    await put(
      config,
      `menuboard/${params.boardId}/product/${params.id}`,
      buildProductBody(params.catId!, values),
    );
    return logAndRedirectToBoard(
      params.boardId!,
      `Updated product "${values.name}" in category ${params.catId}`,
      "Product updated",
    );
  },
);

/** POST /admin/menuboard/:boardId/category/:catId/product/:id/delete — delete product */
const handleProductDelete = deleteBoardChild("product", "product");

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
