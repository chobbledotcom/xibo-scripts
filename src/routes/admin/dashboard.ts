/**
 * Admin dashboard route
 */

import { defineRoutes } from "#routes/router.ts";
import { htmlResponse, withSession } from "#routes/utils.ts";
import { adminDashboardPage } from "#templates/admin/dashboard.tsx";
import { adminLoginPage } from "#templates/admin/login.tsx";
import {
  DISCONNECTED_STATUS,
  getDashboardStatus,
  loadXiboConfig,
} from "#xibo/client.ts";

/** Login page response helper */
export const loginResponse = (error?: string, status = 200) =>
  htmlResponse(adminLoginPage(error), status);

/**
 * Handle GET /admin/
 */
const handleAdminGet = (request: Request): Promise<Response> =>
  withSession(
    request,
    async (session) => {
      const config = await loadXiboConfig();
      const status = config
        ? await getDashboardStatus(config)
        : DISCONNECTED_STATUS;
      return htmlResponse(adminDashboardPage(session, status));
    },
    () => loginResponse(),
  );

/** Dashboard routes */
export const dashboardRoutes = defineRoutes({
  "GET /admin": (request) => handleAdminGet(request),
});
