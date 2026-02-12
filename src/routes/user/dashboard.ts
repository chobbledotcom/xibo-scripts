/**
 * User dashboard routes
 *
 * Provides the user home page listing their businesses, and a
 * per-business overview with screen count, product count, and quick links.
 */

import { getBusinessesForUser, toDisplayBusiness } from "#lib/db/businesses.ts";
import { getScreensForBusiness } from "#lib/db/screens.ts";
import { get } from "#xibo/client.ts";
import type { XiboDatasetRow } from "#xibo/types.ts";
import { htmlResponse } from "#routes/utils.ts";
import { defineRoutes } from "#routes/router.ts";
import { getQueryMessages, sessionRoute, toAdminSession } from "#routes/admin/utils.ts";
import {
  userBusinessDetailRoute,
  withUserBusiness,
} from "#routes/user/utils.ts";
import {
  userBusinessDetailPage,
  userDashboardPage,
} from "#templates/user/dashboard.tsx";

/** Count products by fetching dataset rows, returning 0 on any failure */
const countProducts = async (
  config: Parameters<typeof get>[0],
  datasetId: number | null,
): Promise<number> => {
  if (datasetId === null) return 0;
  try {
    return (await get<XiboDatasetRow[]>(config, `dataset/data/${datasetId}`)).length;
  } catch {
    return 0;
  }
};

/** GET /dashboard — user home, list businesses they belong to */
const handleDashboardGet = sessionRoute(
  async (session, _config, _request) => {
    const businesses = await getBusinessesForUser(session.userId);
    const displayBusinesses = await Promise.all(
      businesses.map(toDisplayBusiness),
    );
    return htmlResponse(
      userDashboardPage(toAdminSession(session), displayBusinesses),
    );
  },
);

/** GET /dashboard/business/:id — business overview */
const handleBusinessDetail = userBusinessDetailRoute(
  async (session, config, _ctx, params, request) => {
    const businessId = Number(params.id);
    const result = await withUserBusiness(session.userId, businessId);
    if (result instanceof Response) return result;

    const { success, error: queryError } = getQueryMessages(request);
    const screens = await getScreensForBusiness(businessId);
    const productCount = await countProducts(config, result.xibo_dataset_id);

    return htmlResponse(
      userBusinessDetailPage(
        toAdminSession(session),
        { business: result, screenCount: screens.length, productCount },
        success,
        queryError,
      ),
    );
  },
);

/** User dashboard routes */
export const userDashboardRoutes = defineRoutes({
  "GET /dashboard": (request) => handleDashboardGet(request),
  "GET /dashboard/business/:id": (request, params) =>
    handleBusinessDetail(request, params),
});
