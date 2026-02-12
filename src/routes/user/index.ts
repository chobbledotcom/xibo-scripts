/**
 * User routes - combined from individual route modules
 */

import { userDashboardRoutes } from "#routes/user/dashboard.ts";
import { userMediaRoutes } from "#routes/user/media.ts";
import { userProductRoutes } from "#routes/user/products.ts";
import { createRouter } from "#routes/router.ts";

/** Combined user routes */
const userRoutes = {
  ...userDashboardRoutes,
  ...userMediaRoutes,
  ...userProductRoutes,
};

/** Route user requests using declarative router */
export const routeUser = createRouter(userRoutes);
