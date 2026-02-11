/**
 * Admin routes - combined from individual route modules
 */

import { authRoutes } from "#routes/admin/auth.ts";
import { dashboardRoutes } from "#routes/admin/dashboard.ts";
import { datasetRoutes } from "#routes/admin/datasets.ts";
import { layoutRoutes } from "#routes/admin/layouts.ts";
import { mediaRoutes } from "#routes/admin/media.ts";
import { menuBoardRoutes } from "#routes/admin/menuboards.ts";
import { sessionsRoutes } from "#routes/admin/sessions.tsx";
import { settingsRoutes } from "#routes/admin/settings.tsx";
import { usersRoutes } from "#routes/admin/users.ts";
import { createRouter } from "#routes/router.ts";

/** Combined admin routes */
const adminRoutes = {
  ...dashboardRoutes,
  ...authRoutes,
  ...settingsRoutes,
  ...sessionsRoutes,
  ...mediaRoutes,
  ...menuBoardRoutes,
  ...layoutRoutes,
  ...datasetRoutes,
  ...usersRoutes,
};

/** Route admin requests using declarative router */
export const routeAdmin = createRouter(adminRoutes);
