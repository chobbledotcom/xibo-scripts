/**
 * Admin layout routes — list, view, and delete layouts
 */

import { get, del, loadXiboConfig } from "#xibo/client.ts";
import type {
  XiboConfig,
  XiboLayout,
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
  "GET /admin/layout/:id": (request, params) =>
    handleLayoutDetail(request, params),
  "POST /admin/layout/:id/delete": (request, params) =>
    handleLayoutDelete(request, params),
  "POST /admin/layouts/delete-all": (request) =>
    handleLayoutDeleteAll(request),
});
