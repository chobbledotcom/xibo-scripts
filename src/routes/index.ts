/**
 * Routes module - main exports and router
 * Uses lazy loading to minimize startup time for edge scripts
 */

import { once } from "#fp";
import { isSetupComplete } from "#lib/config.ts";
import { createRequestTimer, logRequest } from "#lib/logger.ts";
import {
  applySecurityHeaders,
  contentTypeRejectionResponse,
  domainRejectionResponse,
  isValidContentType,
  isValidDomain,
} from "#routes/middleware.ts";
import type { createRouter } from "#routes/router.ts";
import { routeStatic } from "#routes/static.ts";
import type { ServerContext } from "#routes/types.ts";
import { notFoundResponse, parseRequest, redirect } from "#routes/utils.ts";

/** Router function type - reuse from router.ts */
type RouterFn = ReturnType<typeof createRouter>;

/** Lazy-load admin routes */
const loadAdminRoutes = once(async () => {
  const { routeAdmin } = await import("#routes/admin/index.ts");
  return routeAdmin;
});

/** Lazy-load user (dashboard) routes */
const loadUserRoutes = once(async () => {
  const { routeUser } = await import("#routes/user/index.ts");
  return routeUser;
});

/** Lazy-load setup routes */
const loadSetupRoutes = once(async () => {
  const { createSetupRouter } = await import("#routes/setup.ts");
  return createSetupRouter(isSetupComplete);
});

// Re-export middleware functions for testing
export {
  getSecurityHeaders,
  isValidContentType,
  isValidDomain,
} from "#routes/middleware.ts";

// Re-export types
export type { ServerContext } from "#routes/types.ts";

/** Check if path matches a route prefix */
const matchesPrefix = (path: string, prefix: string): boolean =>
  path === prefix || path.startsWith(`${prefix}/`);

/** Create a lazy-loaded route handler for a path prefix */
const createLazyRoute =
  (prefix: string, loadRoute: () => Promise<RouterFn>): RouterFn =>
  async (request, path, method, server) => {
    if (!matchesPrefix(path, prefix)) return null;
    const route = await loadRoute();
    return route(request, path, method, server);
  };

/** Lazy-loaded route handlers */
const routeAdminPath = createLazyRoute("/admin", loadAdminRoutes);
const routeDashboardPath = createLazyRoute("/dashboard", loadUserRoutes);

/**
 * Route main application requests (after setup is complete)
 */
const routeMainApp: RouterFn = async (request, path, method, server) =>
  (await routeAdminPath(request, path, method, server)) ??
    (await routeDashboardPath(request, path, method, server)) ??
    notFoundResponse();

/**
 * Handle incoming requests (internal, without security headers)
 */
const handleRequestInternal = async (
  request: Request,
  path: string,
  method: string,
  server?: ServerContext,
): Promise<Response> => {
  // Static routes always available (minimal overhead)
  const staticResponse = await routeStatic(request, path, method);
  if (staticResponse) return staticResponse;

  // Setup routes - only load for /setup paths
  if (path === "/setup" || path.startsWith("/setup/")) {
    const routeSetup = await loadSetupRoutes();
    const setupResponse = await routeSetup(request, path, method);
    if (setupResponse) return setupResponse;
  }

  // Require setup before accessing other routes
  if (!(await isSetupComplete())) {
    return redirect("/setup");
  }

  // Root path redirects to admin dashboard
  if (path === "/" && method === "GET") {
    return redirect("/admin");
  }

  return (await routeMainApp(request, path, method, server))!;
};

/** Log request and return response */
const logAndReturn = (
  response: Response,
  method: string,
  path: string,
  getElapsed: () => number,
): Response => {
  logRequest({
    method,
    path,
    status: response.status,
    durationMs: getElapsed(),
  });
  return response;
};

/**
 * Handle incoming requests with security headers and domain validation
 */
export const handleRequest = async (
  request: Request,
  server?: ServerContext,
): Promise<Response> => {
  const { path, method } = parseRequest(request);
  const getElapsed = createRequestTimer();

  // Domain validation: reject requests to unauthorized domains
  if (!isValidDomain(request)) {
    return logAndReturn(domainRejectionResponse(), method, path, getElapsed);
  }

  // Content-Type validation for POST requests
  if (!isValidContentType(request)) {
    return logAndReturn(
      contentTypeRejectionResponse(),
      method,
      path,
      getElapsed,
    );
  }

  const response = await handleRequestInternal(request, path, method, server);
  return logAndReturn(applySecurityHeaders(response), method, path, getElapsed);
};
