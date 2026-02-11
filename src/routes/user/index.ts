/**
 * User routes - combined from individual route modules
 */

import { userMediaRoutes } from "#routes/user/media.ts";
import { createRouter } from "#routes/router.ts";

/** Combined user routes */
const userRoutes = {
  ...userMediaRoutes,
};

/** Route user requests using declarative router */
export const routeUser = createRouter(userRoutes);
