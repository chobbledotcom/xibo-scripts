/**
 * Admin layout routes — list, create, view, and delete layouts
 */

import { get, del } from "#xibo/client.ts";
import { createMenuLayout } from "#xibo/layout-builder.ts";
import type {
  XiboCategory,
  XiboLayout,
  XiboMenuBoard,
  XiboProduct,
} from "#xibo/types.ts";
import { defineRoutes } from "#routes/router.ts";
import {
  htmlResponse,
  redirect,
  redirectWithSuccess,
} from "#routes/utils.ts";
import {
  layoutCreatePage,
  layoutDetailPage,
  layoutListPage,
} from "#templates/admin/layouts.tsx";
import {
  deleteRoute,
  detailRoute,
  errorMessage,
  listRoute,
  sessionRoute,
  withXiboForm,
} from "#routes/admin/utils.ts";

// ─── Routes ──────────────────────────────────────────────────────────

/**
 * GET /admin/layouts — list all layouts
 */
const handleLayoutList = listRoute<XiboLayout>("layout", layoutListPage);

/**
 * GET /admin/layout/create — layout creation form
 */
const handleLayoutCreateGet = sessionRoute(
  async (session, config) => {
    let boards: XiboMenuBoard[] = [];
    const categoriesByBoard: Record<number, XiboCategory[]> = {};
    let error: string | undefined;

    try {
      boards = await get<XiboMenuBoard[]>(config, "menuboards");
      for (const board of boards) {
        categoriesByBoard[board.menuId] = await get<XiboCategory[]>(
          config,
          `menuboard/${board.menuId}/categories`,
        );
      }
    } catch (e) {
      error = errorMessage(e);
    }

    return htmlResponse(
      layoutCreatePage(session, boards, categoriesByBoard, error),
    );
  },
);

/**
 * POST /admin/layout/create — create layout from selected category
 */
const handleLayoutCreatePost = (request: Request): Promise<Response> =>
  withXiboForm(request, async (_session, form, config) => {
    const categoryValue = form.get("category") || "";
    const [boardIdStr, catIdStr] = categoryValue.split(":");
    if (!boardIdStr || !catIdStr) {
      return redirect(
        "/admin/layout/create?error=" +
          encodeURIComponent("Please select a category"),
      );
    }

    const boardId = Number(boardIdStr);
    const catId = Number(catIdStr);

    // Fetch the category name
    const categories = await get<XiboCategory[]>(
      config,
      `menuboard/${boardId}/categories`,
    );
    const category = categories.find((c) => c.menuCategoryId === catId);
    if (!category) {
      return redirect(
        "/admin/layout/create?error=" +
          encodeURIComponent("Category not found"),
      );
    }

    // Fetch products for the category
    const categoryProducts = await get<XiboProduct[]>(
      config,
      `menuboard/${catId}/products`,
    );
    const products = categoryProducts
      .map((p) => ({ name: p.name, price: p.price }));

    const layout = await createMenuLayout(
      config,
      category.name,
      products,
    );

    return redirectWithSuccess(
      `/admin/layout/${layout.layoutId}`,
      "Layout created",
    );
  });

/**
 * GET /admin/layout/:id — view layout details
 */
const handleLayoutDetail = detailRoute(
  async (session, config, params) => {
    const layouts = await get<XiboLayout[]>(config, "layout", {
      layoutId: params.id!,
    });
    const layout = layouts[0];
    if (!layout) {
      return htmlResponse("Layout not found", 404);
    }
    return htmlResponse(layoutDetailPage(session, layout));
  },
);

/**
 * POST /admin/layout/:id/delete — delete a layout
 */
const handleLayoutDelete = deleteRoute(
  (p) => `layout/${p.id}`,
  "/admin/layouts",
  "Layout deleted",
);

/**
 * POST /admin/layouts/delete-all — batch delete all layouts
 */
const handleLayoutDeleteAll = (request: Request): Promise<Response> =>
  withXiboForm(request, async (_session, _form, config) => {
    try {
      const layouts = await get<XiboLayout[]>(config, "layout");
      for (const layout of layouts) {
        await del(config, `layout/${layout.layoutId}`);
      }
      const count = layouts.length;
      const msg = `Deleted ${count} layout${count !== 1 ? "s" : ""}`;
      return redirectWithSuccess("/admin/layouts", msg);
    } catch (e) {
      const msg = `Delete failed: ${errorMessage(e)}`;
      return redirect(`/admin/layouts?error=${encodeURIComponent(msg)}`);
    }
  });

/** Layout routes */
export const layoutRoutes = defineRoutes({
  "GET /admin/layouts": (request) => handleLayoutList(request),
  "GET /admin/layout/create": (request) => handleLayoutCreateGet(request),
  "POST /admin/layout/create": (request) => handleLayoutCreatePost(request),
  "GET /admin/layout/:id": (request, params) =>
    handleLayoutDetail(request, params),
  "POST /admin/layout/:id/delete": (request, params) =>
    handleLayoutDelete(request, params),
  "POST /admin/layouts/delete-all": (request) =>
    handleLayoutDeleteAll(request),
});
