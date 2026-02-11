/**
 * Admin route utilities
 */

import { get, del, loadXiboConfig } from "#xibo/client.ts";
import { validateForm, type Field } from "#lib/forms.tsx";
import type { XiboConfig } from "#xibo/types.ts";
import type { AuthSession } from "#routes/utils.ts";
import {
  htmlResponse,
  redirect,
  redirectWithSuccess,
  requireSessionOr,
  withAuthForm,
} from "#routes/utils.ts";

/** Route params from URL patterns */
type Params = Record<string, string | undefined>;

/** Route handler that receives URL params */
type ParamHandler = (request: Request, params: Params) => Promise<Response>;

/** Clear session cookie on logout */
export const clearSessionCookie =
  "__Host-session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0";

/**
 * Load Xibo config or redirect to settings if not configured.
 */
export const withXiboConfig = async (
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
export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : "Unknown error";

/** Extract the `?success=` query parameter from a request. */
export const getSuccessParam = (request: Request): string | undefined =>
  new URL(request.url).searchParams.get("success") || undefined;

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
 * Validates form input, then calls handler with parsed values + config + params.
 */
export const formRouteP = <T>(
  fields: Field[],
  handler: (
    values: T,
    config: XiboConfig,
    params: Params,
  ) => Promise<Response>,
): ParamHandler =>
(request, params) =>
  withXiboForm(request, async (_session, form, config) => {
    const v = validateForm<T>(form, fields);
    if (!v.valid) return htmlResponse(v.error, 400);
    return handler(v.values, config, params);
  });

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
  withXiboForm(request, async (_session, _form, config) => {
    try {
      await del(config, endpoint);
      return redirectWithSuccess(listUrl, successMsg);
    } catch (e) {
      return redirect(
        `${listUrl}?error=${encodeURIComponent(`Delete failed: ${errorMessage(e)}`)}`,
      );
    }
  });

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
