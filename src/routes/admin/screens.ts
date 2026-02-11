/**
 * Admin screen management routes - manager or above
 */

import { filter } from "#fp";
import { logActivity } from "#lib/db/activityLog.ts";
import { getBusinessById, toDisplayBusiness } from "#lib/db/businesses.ts";
import {
  createScreen,
  deleteScreen,
  getAssignedDisplayIds,
  getScreenById,
  toDisplayScreen,
} from "#lib/db/screens.ts";
import { validateForm } from "#lib/forms.tsx";
import { get } from "#xibo/client.ts";
import type { XiboConfig, XiboDisplay } from "#xibo/types.ts";
import { defineRoutes } from "#routes/router.ts";
import type { RouteParams } from "#routes/router.ts";
import type { AuthSession } from "#routes/utils.ts";
import { htmlResponse, redirectWithSuccess } from "#routes/utils.ts";
import { requireManagerOrAbove, withManagerAuthForm } from "#routes/utils.ts";
import {
  errorMessage,
  getQueryMessages,
  toAdminSession,
  withXiboConfig,
} from "#routes/admin/utils.ts";
import {
  adminScreenCreatePage,
  adminScreenDetailPage,
} from "#templates/admin/screens.tsx";
import { screenFields, type ScreenFormValues } from "#templates/fields.ts";

/** Fetch available (unassigned) Xibo displays */
const fetchAvailableDisplays = async (
  config: XiboConfig,
): Promise<{ displays: XiboDisplay[]; error?: string }> => {
  try {
    const allDisplays = await get<XiboDisplay[]>(config, "display");
    const assignedIds = await getAssignedDisplayIds();
    const assignedSet = new Set(assignedIds);
    return {
      displays: filter((d: XiboDisplay) => !assignedSet.has(d.displayId))(allDisplays),
    };
  } catch (e) {
    return { displays: [], error: errorMessage(e) };
  }
};

/** Load and validate screen belongs to business, or return 404 */
const loadScreenForBusiness = async (
  businessId: number,
  screenId: number,
): Promise<{ business: Awaited<ReturnType<typeof getBusinessById>>; screen: Awaited<ReturnType<typeof getScreenById>> } | Response> => {
  const biz = await getBusinessById(businessId);
  if (!biz) return htmlResponse("<h1>Business not found</h1>", 404);

  const screen = await getScreenById(screenId);
  if (!screen || screen.business_id !== businessId) {
    return htmlResponse("<h1>Screen not found</h1>", 404);
  }
  return { business: biz, screen };
};

/** Business type from DB loader */
type Business = NonNullable<Awaited<ReturnType<typeof getBusinessById>>>;

/** Screen GET route: require manager auth + load business from params */
const withScreenAuth = (
  request: Request,
  params: RouteParams,
  handler: (session: AuthSession, biz: Business) => Promise<Response>,
): Promise<Response> =>
  requireManagerOrAbove(request, async (session) => {
    const biz = await getBusinessById(Number(params.id));
    if (!biz) return htmlResponse("<h1>Business not found</h1>", 404);
    return handler(session, biz);
  });

/** Screen POST route: require manager auth form + load business from params */
const withScreenForm = (
  request: Request,
  params: RouteParams,
  handler: (session: AuthSession, form: URLSearchParams, biz: Business) => Promise<Response>,
): Promise<Response> =>
  withManagerAuthForm(request, async (session, form) => {
    const biz = await getBusinessById(Number(params.id));
    return biz
      ? handler(session, form, biz)
      : htmlResponse("<h1>Business not found</h1>", 404);
  });

/** Handle GET /admin/business/:id/screen/create */
const handleScreenCreateGet = (
  request: Request,
  params: RouteParams,
): Promise<Response> =>
  withScreenAuth(request, params, async (session, biz) => {
    const bizDisplay = await toDisplayBusiness(biz);
    let availableDisplays: XiboDisplay[] = [];
    let fetchError: string | undefined;

    const configResult = await withXiboConfig(async (config) => {
      const result = await fetchAvailableDisplays(config);
      availableDisplays = result.displays;
      fetchError = result.error;
      return new Response("");
    });

    if (configResult.status === 302) availableDisplays = [];

    return htmlResponse(
      adminScreenCreatePage(bizDisplay, availableDisplays, toAdminSession(session), fetchError),
    );
  });

/** Handle POST /admin/business/:id/screen/create */
const handleScreenCreatePost = (
  request: Request,
  params: RouteParams,
): Promise<Response> =>
  withScreenForm(request, params, async (session, form, biz) => {
    const validation = validateForm<ScreenFormValues>(form, screenFields);
    if (!validation.valid) {
      const bizDisplay = await toDisplayBusiness(biz);
      return htmlResponse(
        adminScreenCreatePage(bizDisplay, [], toAdminSession(session), validation.error),
        400,
      );
    }

    const xiboDisplayIdStr = form.get("xibo_display_id");
    const xiboDisplayId = xiboDisplayIdStr ? Number(xiboDisplayIdStr) : null;

    await createScreen(validation.values.name, biz.id, xiboDisplayId || null);
    await logActivity(`Created screen "${validation.values.name}" for business ${biz.id}`);
    return redirectWithSuccess(`/admin/business/${biz.id}`, "Screen created");
  });

/** Handle GET /admin/business/:businessId/screen/:id */
const handleScreenDetailGet = (
  request: Request,
  params: RouteParams,
): Promise<Response> =>
  requireManagerOrAbove(request, async (session) => {
    const loaded = await loadScreenForBusiness(Number(params.businessId), Number(params.id));
    if (loaded instanceof Response) return loaded;

    const { success } = getQueryMessages(request);
    return htmlResponse(
      adminScreenDetailPage(
        await toDisplayBusiness(loaded.business!),
        await toDisplayScreen(loaded.screen!),
        toAdminSession(session),
        undefined,
        success,
      ),
    );
  });

/** Handle POST /admin/business/:businessId/screen/:id/delete */
const handleScreenDeletePost = (
  request: Request,
  params: RouteParams,
): Promise<Response> =>
  withManagerAuthForm(request, async (_session, _form) => {
    const businessId = Number(params.businessId);
    const loaded = await loadScreenForBusiness(businessId, Number(params.id));
    if (loaded instanceof Response) return loaded;

    await deleteScreen(loaded.screen!.id);
    await logActivity(`Deleted screen ${loaded.screen!.id} from business ${businessId}`);
    return redirectWithSuccess(`/admin/business/${businessId}`, "Screen deleted");
  });

/** Screen management routes */
export const screenRoutes = defineRoutes({
  "GET /admin/business/:id/screen/create": handleScreenCreateGet,
  "POST /admin/business/:id/screen/create": handleScreenCreatePost,
  "GET /admin/business/:businessId/screen/:id": handleScreenDetailGet,
  "POST /admin/business/:businessId/screen/:id/delete": handleScreenDeletePost,
});
