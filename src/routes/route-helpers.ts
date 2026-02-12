/**
 * Shared route utilities
 *
 * Higher-order functions and helpers used by both admin and user route modules.
 * Composes the lower-level primitives from routes/utils.ts into convenient
 * session+config wrappers, list/detail/form route builders, and entity helpers.
 */

import { get, del, loadXiboConfig } from "#xibo/client.ts";
import { validateForm, type Field } from "#lib/forms.tsx";
import { errorMessage } from "#lib/logger.ts";
import type { AdminSession } from "#lib/types.ts";
import type { XiboConfig } from "#xibo/types.ts";
import type { AuthSession } from "#routes/utils.ts";
import {
  clearCookie,
  htmlResponse,
  redirectWithError,
  redirectWithSuccess,
  requireSessionOr,
  withAuthForm,
} from "#routes/utils.ts";

// Re-export for convenience — many route modules need errorMessage
export { errorMessage } from "#lib/logger.ts";

/** Route params from URL patterns (same as RouteParams from router.ts) */
export type Params = Record<string, string | undefined>;

/** Route handler that receives URL params */
export type ParamHandler = (request: Request, params: Params) => Promise<Response>;

/** Clear session cookie on logout */
export const clearSessionCookie = clearCookie("__Host-session", "/");

/** Build AdminSession for template rendering from an AuthSession */
export const toAdminSession = (session: AuthSession): AdminSession => ({
  csrfToken: session.csrfToken,
  adminLevel: session.adminLevel,
  impersonating: session.impersonating,
});

/**
 * Load Xibo config or redirect to settings if not configured.
 */
export const withXiboConfig = async (
  handler: (config: XiboConfig) => Promise<Response>,
): Promise<Response> => {
  const config = await loadXiboConfig();
  if (!config) {
    return redirectWithSuccess(
      "/admin/settings",
      "Configure Xibo API credentials first",
    );
  }
  return handler(config);
};

/** Extract the `?success=` query parameter from a request. */
export const getSuccessParam = (request: Request): string | undefined =>
  new URL(request.url).searchParams.get("success") || undefined;

/** Extract `?error=` and `?success=` query parameters from a request. */
export const getQueryMessages = (
  request: Request,
): { error: string | undefined; success: string | undefined } => {
  const url = new URL(request.url);
  return {
    error: url.searchParams.get("error") || undefined,
    success: url.searchParams.get("success") || undefined,
  };
};

/**
 * Fetch a list of entities from the Xibo API, catching errors.
 * Returns `{ items, error }` so callers can render error state.
 */
export const fetchList = async <T>(
  config: XiboConfig,
  endpoint: string,
): Promise<{ items: T[]; error: string | undefined }> => {
  try {
    return { items: await get<T[]>(config, endpoint), error: undefined };
  } catch (e) {
    return { items: [], error: errorMessage(e) };
  }
};

/**
 * Require authenticated session + Xibo config.
 * Combines requireSessionOr and withXiboConfig into a single wrapper.
 */
export const withXiboSession = (
  request: Request,
  handler: (session: AuthSession, config: XiboConfig) => Promise<Response>,
): Promise<Response> =>
  requireSessionOr(request, (session) =>
    withXiboConfig((config) => handler(session, config)),
  );

/**
 * Require authenticated form submission + Xibo config.
 * Combines withAuthForm and withXiboConfig into a single wrapper.
 */
export const withXiboForm = (
  request: Request,
  handler: (
    session: AuthSession,
    form: URLSearchParams,
    config: XiboConfig,
  ) => Promise<Response>,
): Promise<Response> =>
  withAuthForm(request, (session, form) =>
    withXiboConfig((config) => handler(session, form, config)),
  );

// ─── Route-Level HOFs ───────────────────────────────────────────────
// These return handler functions for use in route tables, eliminating
// repeated handler signatures and providing session/config automatically.

/**
 * Create a session-aware GET route handler (no URL params).
 * Handler receives (session, config, request).
 */
export const sessionRoute = (
  handler: (
    session: AuthSession,
    config: XiboConfig,
    request: Request,
  ) => Promise<Response>,
): ((request: Request) => Promise<Response>) =>
(request) =>
  withXiboSession(request, (session, config) =>
    handler(session, config, request));

/**
 * Create a session-aware route handler with URL params.
 * Handler receives (session, config, params, request).
 */
export const detailRoute = (
  handler: (
    session: AuthSession,
    config: XiboConfig,
    params: Params,
    request: Request,
  ) => Promise<Response>,
): ParamHandler =>
(request, params) =>
  withXiboSession(request, (session, config) =>
    handler(session, config, params, request));

/**
 * Create a list page route handler.
 * Fetches items from the API and renders with optional success/error messages.
 */
export const listRoute = <T>(
  endpoint: string,
  renderPage: (
    session: AuthSession,
    items: T[],
    success?: string,
    error?: string,
  ) => string,
): ((request: Request) => Promise<Response>) =>
(request) =>
  withXiboSession(request, async (session, config) => {
    const success = getSuccessParam(request);
    const { items, error } = await fetchList<T>(config, endpoint);
    return htmlResponse(renderPage(session, items, success, error));
  });

/**
 * Create a validated-form route handler with URL params.
 * Validates form input, then calls handler with parsed values + config + params + session.
 */
export const formRouteP = <T>(
  fields: Field[],
  handler: (
    values: T,
    config: XiboConfig,
    params: Params,
    session: AuthSession,
  ) => Promise<Response>,
): ParamHandler =>
(request, params) =>
  withXiboForm(request, (session, form, config) => {
    const v = validateForm<T>(form, fields);
    if (!v.valid) return Promise.resolve(htmlResponse(v.error, 400));
    return handler(v.values, config, params, session);
  });

/**
 * Execute a Xibo API operation, then run onSuccess only if it succeeds.
 * On API failure, redirects with an error message — no DB writes happen.
 * Use this whenever a DB write must be guarded by a successful Xibo API call.
 */
export const xiboThenPersist = async <T>(
  apiCall: () => Promise<T>,
  errorUrl: string,
  onSuccess: (result: T) => Promise<Response>,
): Promise<Response> => {
  try {
    const result = await apiCall();
    return onSuccess(result);
  } catch (e) {
    return redirectWithError(errorUrl, errorMessage(e));
  }
};

/**
 * Delete a single entity and redirect to the list page.
 * Shows error on the list page if delete fails.
 */
export const deleteEntity = (
  request: Request,
  endpoint: string,
  listUrl: string,
  successMsg: string,
): Promise<Response> =>
  withXiboForm(request, (_session, _form, config) =>
    xiboThenPersist(
      () => del(config, endpoint),
      listUrl,
      () => Promise.resolve(redirectWithSuccess(listUrl, successMsg)),
    ),
  );

/**
 * Create a delete route handler from endpoint template, list URL, and message.
 */
export const deleteRoute = (
  endpointFn: (params: Params) => string,
  listUrl: string,
  successMsg: string,
): ParamHandler =>
(request, params) =>
  deleteEntity(request, endpointFn(params), listUrl, successMsg);

/**
 * Load an entity by ID and pass it to a handler, or early-return 404.
 * Combines load-or-404 and handler dispatch in a single call.
 */
export const withEntity = async <T>(
  loader: (id: number) => Promise<T | null>,
  id: number,
  label: string,
  handler: (entity: T) => Promise<Response>,
): Promise<Response> => {
  const entity = await loader(id);
  if (!entity) return htmlResponse(`<h1>${label} not found</h1>`, 404);
  return handler(entity);
};

