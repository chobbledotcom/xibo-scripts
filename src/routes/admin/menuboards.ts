/**
 * Admin menu board routes — CRUD for boards, categories, and products
 */

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
  xiboThenPersist,
} from "#routes/admin/utils.ts";

// ─── Data Helpers ────────────────────────────────────────────────────

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
  const boards = await get<XiboMenuBoard[]>(config, "menuboards", {
    menuId: boardId,
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
    const categories = await fetchCategories(config, board.menuId);
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
  detailRoute((session, config, params, request) =>
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
  detailRoute((session, config, params) =>
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
    (_values, config, params) =>
      xiboThenPersist(
        () => del(config, `menuboard/${params.id}/${subpath}`),
        `/admin/menuboard/${params.boardId}`,
        async () => {
          await logActivity(
            `Deleted ${entity} ${params.id} from board ${params.boardId}`,
          );
          return redirectWithSuccess(
            `/admin/menuboard/${params.boardId}`,
            `${entity[0]!.toUpperCase()}${entity.slice(1)} deleted`,
          );
        },
      ),
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

/** Xibo API mutation for a board child, with activity logging on success. */
const boardChildMutation = (
  apiCall: () => Promise<unknown>,
  boardId: string,
  logMsg: string,
  successMsg: string,
): Promise<Response> =>
  xiboThenPersist(
    apiCall,
    `/admin/menuboard/${boardId}`,
    () => logAndRedirectToBoard(boardId, logMsg, successMsg),
  );

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
  "menuboards",
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
  (values, config) =>
    xiboThenPersist(
      () => post<XiboMenuBoard>(config, "menuboard", buildBoardBody(values)),
      "/admin/menuboards",
      async (created) => {
        await logActivity(`Created menu board "${values.name}"`);
        return redirectWithSuccess(
          `/admin/menuboard/${created.menuId}`,
          "Menu board created",
        );
      },
    ),
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
      categories = await fetchCategories(config, board.menuId);
      productsByCategory = await fetchProductsByCategory(
        config,
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
  (session, _config, board) =>
    Promise.resolve(htmlResponse(menuBoardFormPage(session, board))),
);

/** POST /admin/menuboard/:id — update board */
const handleBoardUpdate = formRouteP<MenuBoardFormValues>(
  menuBoardFields,
  (values, config, params) =>
    xiboThenPersist(
      () => put(config, `menuboard/${params.id}`, buildBoardBody(values)),
      `/admin/menuboard/${params.id}`,
      async () => {
        await logActivity(`Updated menu board "${values.name}"`);
        return redirectWithSuccess(
          `/admin/menuboard/${params.id}`,
          "Menu board updated",
        );
      },
    ),
);

/** POST /admin/menuboard/:id/delete — delete board */
const handleBoardDelete = formRouteP<Record<string, never>>(
  [],
  (_values, config, params) =>
    xiboThenPersist(
      async () => {
        const boards = await get<XiboMenuBoard[]>(config, "menuboards", {
          menuId: params.id!,
        });
        const name = boards[0]?.name ?? params.id;
        await del(config, `menuboard/${params.id}`);
        return name;
      },
      "/admin/menuboards",
      async (name) => {
        await logActivity(`Deleted menu board "${name}"`);
        return redirectWithSuccess("/admin/menuboards", "Menu board deleted");
      },
    ),
);

// ─── Category Routes ────────────────────────────────────────────────

/** GET /admin/menuboard/:boardId/category/new — new category form */
const handleCategoryNew = boardRoute(
  "boardId",
  (session, _config, board) =>
    Promise.resolve(htmlResponse(
      categoryFormPage(session, board.menuId, board.name),
    )),
);

/** POST /admin/menuboard/:boardId/category — create category */
const handleCategoryCreate = formRouteP<CategoryFormValues>(
  categoryFields,
  (values, config, params) =>
    boardChildMutation(
      () => post(config, `menuboard/${params.boardId}/category`, buildCategoryBody(values)),
      params.boardId!,
      `Created category "${values.name}" in board ${params.boardId}`,
      "Category created",
    ),
);

/** GET /admin/menuboard/:boardId/category/:id/edit — edit category form */
const handleCategoryEdit = boardCategoryRoute(
  "id",
  (session, _config, board, category, _categories, _params) =>
    Promise.resolve(htmlResponse(
      categoryFormPage(
        session,
        board.menuId,
        board.name,
        category,
      ),
    )),
);

/** POST /admin/menuboard/:boardId/category/:id — update category */
const handleCategoryUpdate = formRouteP<CategoryFormValues>(
  categoryFields,
  (values, config, params) =>
    boardChildMutation(
      () => put(config, `menuboard/${params.id}/category`, buildCategoryBody(values)),
      params.boardId!,
      `Updated category "${values.name}" in board ${params.boardId}`,
      "Category updated",
    ),
);

/** POST /admin/menuboard/:boardId/category/:id/delete — delete category */
const handleCategoryDelete = deleteBoardChild("category", "category");

// ─── Product Routes ──────────────────────────────────────────────────

/** GET /admin/menuboard/:boardId/category/:catId/product/new — new product form */
const handleProductNew = boardCategoryRoute(
  "catId",
  (session, _config, board, category, _categories, _params) =>
    Promise.resolve(htmlResponse(
      productFormPage(
        session,
        board.menuId,
        board.name,
        category.menuCategoryId,
        category.name,
      ),
    )),
);

/** POST /admin/menuboard/:boardId/category/:catId/product — create product */
const handleProductCreate = formRouteP<ProductFormValues>(
  productFields,
  (values, config, params) =>
    boardChildMutation(
      () => post(config, `menuboard/${params.catId}/product`, buildProductBody(params.catId!, values)),
      params.boardId!,
      `Created product "${values.name}" in category ${params.catId}`,
      "Product created",
    ),
);

/** GET /admin/menuboard/:boardId/category/:catId/product/:id/edit — edit product form */
const handleProductEdit = boardCategoryRoute(
  "catId",
  async (session, config, board, category, categories, params) => {
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
  },
);

/** POST /admin/menuboard/:boardId/category/:catId/product/:id — update product */
const handleProductUpdate = formRouteP<ProductFormValues>(
  productFields,
  (values, config, params) =>
    boardChildMutation(
      () => put(config, `menuboard/${params.id}/product`, buildProductBody(params.catId!, values)),
      params.boardId!,
      `Updated product "${values.name}" in category ${params.catId}`,
      "Product updated",
    ),
);

/** POST /admin/menuboard/:boardId/category/:catId/product/:id/delete — delete product */
const handleProductDelete = deleteBoardChild("product", "product");

// ─── Route Definitions ──────────────────────────────────────────────

/** Menu board routes */
export const menuBoardRoutes = defineRoutes({
  // Boards
  "GET /admin/menuboards": (request) => handleBoardList(request),
  "GET /admin/menuboard/new": (request) => handleBoardNew(request),
  "POST /admin/menuboard": (request) => handleBoardCreate(request, {}),
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
