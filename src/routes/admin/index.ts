/**
 * Admin routes - combined from individual route modules
 */

import { authRoutes } from "#routes/admin/auth.ts";
import { dashboardRoutes } from "#routes/admin/dashboard.ts";
import { mediaRoutes } from "#routes/admin/media.ts";
import { sessionsRoutes } from "#routes/admin/sessions.tsx";
import { settingsRoutes } from "#routes/admin/settings.tsx";
import { createRouter } from "#routes/router.ts";

/** Combined admin routes */
const adminRoutes = {
  ...dashboardRoutes,
  ...authRoutes,
  ...settingsRoutes,
  ...sessionsRoutes,
  ...mediaRoutes,
};

/** Route admin requests using declarative router */
export const routeAdmin = createRouter(adminRoutes);
