/**
 * Admin layout routes — list, create, view, and delete layouts
 */

import { get, del, loadXiboConfig } from "#xibo/client.ts";
import { createMenuLayout } from "#xibo/layout-builder.ts";
import type {
  XiboCategory,
  XiboConfig,
  XiboLayout,
  XiboMenuBoard,
  XiboProduct,
} from "#xibo/types.ts";
import { defineRoutes, type RouteParams } from "#routes/router.ts";
import {
  htmlResponse,
  redirect,
  redirectWithSuccess,
  requireSessionOr,
  withAuthForm,
} from "#routes/utils.ts";
import {
  layoutCreatePage,
  layoutDetailPage,
  layoutListPage,
} from "#templates/admin/layouts.tsx";

/**
 * Helper: load Xibo config or redirect to settings if not configured
 */
const withXiboConfig = async (
  handler: (config: XiboConfig) => Promise<Response>,
): Promise<Response> => {
  const config = await loadXiboConfig();
  if (!config) {
    return redirect(
      "/admin/settings?success=" +
        encodeURIComponent("Configure Xibo API credentials first"),
    );
  }
  return handler(config);
};

/** Extract error message from an unknown thrown value. */
function errorMessage(e: unknown): string { return e instanceof Error ? e.message : "Unknown error"; }

// ─── Routes ──────────────────────────────────────────────────────────

/**
 * GET /admin/layouts — list all layouts
 */
const handleLayoutList = (request: Request): Promise<Response> =>
  requireSessionOr(request, (session) =>
    withXiboConfig(async (config) => {
      const url = new URL(request.url);
      const success = url.searchParams.get("success") || undefined;
      let layouts: XiboLayout[] = [];
      let error: string | undefined;
      try {
        layouts = await get<XiboLayout[]>(config, "layout");
      } catch (e) {
        error = errorMessage(e);
      }
      return htmlResponse(layoutListPage(session, layouts, success, error));
    }),
  );

/**
 * GET /admin/layout/create — layout creation form
 */
const handleLayoutCreateGet = (request: Request): Promise<Response> =>
  requireSessionOr(request, (session) =>
    withXiboConfig(async (config) => {
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
    }),
  );

/**
 * POST /admin/layout/create — create layout from selected category
 */
const handleLayoutCreatePost = (request: Request): Promise<Response> =>
  withAuthForm(request, (_session, form) =>
    withXiboConfig(async (config) => {
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
    }),
  );

/**
 * GET /admin/layout/:id — view layout details
 */
const handleLayoutDetail = (
  request: Request,
  params: RouteParams,
): Promise<Response> =>
  requireSessionOr(request, (session) =>
    withXiboConfig(async (config) => {
      const layouts = await get<XiboLayout[]>(config, "layout", {
        layoutId: params.id!,
      });
      const layout = layouts[0];
      if (!layout) {
        return htmlResponse("Layout not found", 404);
      }
      return htmlResponse(layoutDetailPage(session, layout));
    }),
  );

/**
 * POST /admin/layout/:id/delete — delete a layout
 */
const handleLayoutDelete = (
  request: Request,
  params: RouteParams,
): Promise<Response> =>
  withAuthForm(request, (_session, _form) =>
    withXiboConfig(async (config) => {
      try {
        await del(config, `layout/${params.id}`);
        return redirectWithSuccess("/admin/layouts", "Layout deleted");
      } catch (e) {
        return redirect(
          `/admin/layouts?error=${encodeURIComponent(`Delete failed: ${errorMessage(e)}`)}`,
        );
      }
    }),
  );

/**
 * POST /admin/layouts/delete-all — batch delete all layouts
 */
const handleLayoutDeleteAll = (request: Request): Promise<Response> =>
  withAuthForm(request, (_session, _form) =>
    withXiboConfig(async (config) => {
      try {
        const layouts = await get<XiboLayout[]>(config, "layout");
        for (const layout of layouts) {
          await del(config, `layout/${layout.layoutId}`);
        }
        const msg = `Deleted ${layouts.length} layout${layouts.length !== 1 ? "s" : ""}`;
        return redirectWithSuccess("/admin/layouts", msg);
      } catch (e) {
        return redirect(
          `/admin/layouts?error=${encodeURIComponent(`Delete failed: ${errorMessage(e)}`)}`,
        );
      }
    }),
  );

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
