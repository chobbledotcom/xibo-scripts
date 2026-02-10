/**
 * Admin layout routes — list, create, view, and delete layouts
 */

import { logActivity } from "#lib/db/activityLog.ts";
import { del, get, loadXiboConfig } from "#xibo/client.ts";
import type {
  XiboCategory,
  XiboConfig,
  XiboLayout,
  XiboMenuBoard,
  XiboProduct,
} from "#xibo/types.ts";
import { createMenuLayout } from "#xibo/layout-builder.ts";
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
    return redirect("/admin/settings?error=Xibo+API+not+configured");
  }
  return handler(config);
};

/**
 * Extract error message from an unknown thrown value.
 */
function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unknown error";
}

// ─── List ────────────────────────────────────────────────────────────

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

// ─── Detail ──────────────────────────────────────────────────────────

/**
 * GET /admin/layout/:id — view layout details with grid preview
 */
const handleLayoutDetail = (
  request: Request,
  params: RouteParams,
): Promise<Response> =>
  requireSessionOr(request, (session) =>
    withXiboConfig(async (config) => {
      const layoutId = Number(params.id);
      const layouts = await get<XiboLayout[]>(config, "layout", {
        layoutId: String(layoutId),
      });
      const layout = layouts[0];
      if (!layout) return htmlResponse("Layout not found", 404);
      return htmlResponse(layoutDetailPage(session, layout));
    }),
  );

// ─── Create ──────────────────────────────────────────────────────────

/**
 * GET /admin/layout/create — show creation form with category selection
 */
const handleLayoutCreateGet = (request: Request): Promise<Response> =>
  requireSessionOr(request, (session) =>
    withXiboConfig(async (config) => {
      let boards: XiboMenuBoard[] = [];
      const categories: Array<{
        board: XiboMenuBoard;
        category: XiboCategory;
      }> = [];
      let error: string | undefined;

      try {
        boards = await get<XiboMenuBoard[]>(config, "menuboard");
        for (const board of boards) {
          try {
            const cats = await get<XiboCategory[]>(
              config,
              `menuboard/${board.menuBoardId}/category`,
            );
            for (const cat of cats) {
              categories.push({ board, category: cat });
            }
          } catch {
            // Skip boards whose categories can't be fetched
          }
        }
      } catch (e) {
        error = errorMessage(e);
      }

      return htmlResponse(
        layoutCreatePage(session, boards, categories, error),
      );
    }),
  );

/**
 * POST /admin/layout/create — generate layout from selected category
 */
const handleLayoutCreatePost = (request: Request): Promise<Response> =>
  withAuthForm(request, (_session, form) =>
    withXiboConfig(async (config) => {
      const categoryValue = (form.get("category") || "").trim();
      if (!categoryValue) {
        return redirect("/admin/layout/create");
      }

      const [boardIdStr, catIdStr] = categoryValue.split(":");
      if (!boardIdStr || !catIdStr) {
        return redirect("/admin/layout/create");
      }

      const boardId = Number(boardIdStr);
      const catId = Number(catIdStr);

      // Fetch the category and its products
      const categories = await get<XiboCategory[]>(
        config,
        `menuboard/${boardId}/category`,
      );
      const category = categories.find((c) => c.menuCategoryId === catId);
      if (!category) {
        return redirect(
          "/admin/layout/create?error=" +
            encodeURIComponent("Category not found"),
        );
      }

      const products = await get<XiboProduct[]>(
        config,
        `menuboard/${boardId}/product`,
      );
      const categoryProducts = products.filter(
        (p) => p.menuCategoryId === catId,
      );

      try {
        const layout = await createMenuLayout(
          config,
          category.name,
          categoryProducts.map((p) => ({ name: p.name, price: p.price })),
        );
        await logActivity(
          `Created layout "${layout.layout}" for category "${category.name}"`,
        );
        return redirectWithSuccess(
          `/admin/layout/${layout.layoutId}`,
          "Layout created and published",
        );
      } catch (e) {
        return redirect(
          `/admin/layout/create?error=${encodeURIComponent(`Failed to create layout: ${errorMessage(e)}`)}`,
        );
      }
    }),
  );

// ─── Delete ──────────────────────────────────────────────────────────

/**
 * POST /admin/layout/:id/delete — delete a single layout
 */
const handleLayoutDelete = (
  request: Request,
  params: RouteParams,
): Promise<Response> =>
  withAuthForm(request, (_session, _form) =>
    withXiboConfig(async (config) => {
      try {
        await del(config, `layout/${params.id}`);
        await logActivity(`Deleted layout ${params.id}`);
        return redirectWithSuccess("/admin/layouts", "Layout deleted");
      } catch (e) {
        return redirect(
          `/admin/layouts?error=${encodeURIComponent(`Delete failed: ${errorMessage(e)}`)}`,
        );
      }
    }),
  );

/**
 * POST /admin/layouts/delete-all — batch delete all non-system layouts
 */
const handleLayoutDeleteAll = (request: Request): Promise<Response> =>
  withAuthForm(request, (_session, _form) =>
    withXiboConfig(async (config) => {
      try {
        const layouts = await get<XiboLayout[]>(config, "layout");
        let deleted = 0;
        for (const layout of layouts) {
          try {
            await del(config, `layout/${layout.layoutId}`);
            deleted++;
          } catch {
            // Skip layouts that can't be deleted (e.g., system layouts)
          }
        }
        await logActivity(`Batch deleted ${deleted} layouts`);
        return redirectWithSuccess(
          "/admin/layouts",
          `Deleted ${deleted} layout${deleted !== 1 ? "s" : ""}`,
        );
      } catch (e) {
        return redirect(
          `/admin/layouts?error=${encodeURIComponent(`Delete failed: ${errorMessage(e)}`)}`,
        );
      }
    }),
  );

// ─── Route Definitions ──────────────────────────────────────────────

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
