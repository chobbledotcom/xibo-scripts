/**
 * Shared utilities for route handlers
 */

import { compact, map, pipe, reduce } from "#fp";
import { constantTimeEqual, generateSecureToken } from "#lib/crypto.ts";
import {
  deleteSession,
  getSession,
  onSessionCacheInvalidation,
} from "#lib/db/sessions.ts";
import { decryptAdminLevel, getUserById } from "#lib/db/users.ts";
import { ErrorCode, logError } from "#lib/logger.ts";
import { nowMs } from "#lib/now.ts";
import type { AdminLevel } from "#lib/types.ts";
import type { ServerContext } from "#routes/types.ts";

// Re-export for use by other route modules
export { generateSecureToken };

/**
 * Get client IP from request
 */
export const getClientIp = (
  request: Request,
  server?: ServerContext,
): string => {
  if (server?.requestIP) {
    const info = server.requestIP(request);
    if (info?.address) {
      return info.address;
    }
  }
  return "direct";
};

/**
 * Parse cookies from request
 */
export const parseCookies = (request: Request): Map<string, string> => {
  const header = request.headers.get("cookie");
  if (!header) return new Map<string, string>();

  type CookiePair = [string, string];
  const toPair = (part: string): CookiePair | null => {
    const [key, value] = part.trim().split("=");
    return key && value ? [key, value] : null;
  };

  return pipe(
    map(toPair),
    compact,
    reduce((acc, [key, value]) => {
      acc.set(key, value);
      return acc;
    }, new Map<string, string>()),
  )(header.split(";"));
};

/** Session with CSRF token, wrapped data key for private key derivation, and user role */
export type AuthSession = {
  token: string;
  csrfToken: string;
  wrappedDataKey: string | null;
  userId: number;
  adminLevel: AdminLevel;
};

/**
 * Auth session cache with TTL (10 seconds).
 * Caches the full authenticated session (including decrypted admin level)
 * to avoid repeated user DB queries and decryption on every request.
 */
const AUTH_SESSION_CACHE_TTL_MS = 10_000;
type AuthCacheEntry = { session: AuthSession; cachedAt: number };
const authSessionCache = new Map<string, AuthCacheEntry>();

// Keep auth cache in sync with session cache invalidation
onSessionCacheInvalidation(() => authSessionCache.clear());

/**
 * Clear the auth session cache (for testing and external invalidation)
 */
export const resetAuthSessionCache = (): void => {
  authSessionCache.clear();
};

/**
 * Get authenticated session if valid (with 10s TTL cache)
 */
export const getAuthenticatedSession = async (
  request: Request,
): Promise<AuthSession | null> => {
  const cookies = parseCookies(request);
  const token = cookies.get("__Host-session");
  if (!token) return null;

  // Check auth session cache
  const cached = authSessionCache.get(token);
  if (cached) {
    if (Date.now() - cached.cachedAt <= AUTH_SESSION_CACHE_TTL_MS) {
      return cached.session;
    }
    authSessionCache.delete(token);
  }

  const session = await getSession(token);
  if (!session) return null;

  if (session.expires < nowMs()) {
    await deleteSession(token);
    return null;
  }

  // Load user and decrypt admin level
  const user = await getUserById(session.user_id);
  if (!user) {
    logError({
      code: ErrorCode.AUTH_INVALID_SESSION,
      detail: "Session references non-existent user, invalidating",
    });
    await deleteSession(token);
    return null;
  }

  const adminLevel = await decryptAdminLevel(user);

  const authSession: AuthSession = {
    token,
    csrfToken: session.csrf_token,
    wrappedDataKey: session.wrapped_data_key,
    userId: session.user_id,
    adminLevel,
  };

  authSessionCache.set(token, { session: authSession, cachedAt: Date.now() });

  return authSession;
};

/**
 * Validate CSRF token using constant-time comparison
 */
export const validateCsrfToken = (
  expected: string,
  actual: string,
): boolean => {
  return constantTimeEqual(expected, actual);
};

/**
 * Create HTML response
 */
export const htmlResponse = (html: string, status = 200): Response =>
  new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });

/**
 * Create 404 not found response
 */
export const notFoundResponse = (): Response =>
  htmlResponse("<h1>Not Found</h1>", 404);

/**
 * Create redirect response
 */
export const redirect = (url: string, cookie?: string): Response => {
  const headers: HeadersInit = { location: url };
  if (cookie) {
    headers["set-cookie"] = cookie;
  }
  return new Response(null, { status: 302, headers });
};

/**
 * Create redirect response with a success message as query parameter (PRG pattern)
 */
export const redirectWithSuccess = (
  basePath: string,
  message: string,
): Response => redirect(`${basePath}?success=${encodeURIComponent(message)}`);

/**
 * Parse form data from request
 */
export const parseFormData = async (
  request: Request,
): Promise<URLSearchParams> => {
  const text = await request.text();
  return new URLSearchParams(text);
};

/**
 * Normalize path by stripping trailing slashes (except root "/")
 */
export const normalizePath = (path: string): string =>
  path !== "/" && path.endsWith("/") ? path.slice(0, -1) : path;

/**
 * Parse request URL and extract path/method
 */
export const parseRequest = (
  request: Request,
): { url: URL; path: string; method: string } => {
  const url = new URL(request.url);
  return { url, path: normalizePath(url.pathname), method: request.method };
};

/**
 * Add cookie header to response
 */
export const withCookie = (response: Response, cookie: string): Response => {
  const headers = new Headers(response.headers);
  headers.append("set-cookie", cookie);
  return new Response(response.body, { status: response.status, headers });
};

/**
 * Create HTML response with cookie
 */
export const htmlResponseWithCookie =
  (cookie: string) => (html: string, status = 200): Response =>
    withCookie(htmlResponse(html, status), cookie);

/**
 * Handle request with authenticated session
 */
export const withSession = async (
  request: Request,
  handler: (session: AuthSession) => Response | Promise<Response>,
  onNoSession: () => Response | Promise<Response>,
): Promise<Response> => {
  const session = await getAuthenticatedSession(request);
  return session ? handler(session) : onNoSession();
};

/**
 * Handle request requiring session - redirect to /admin/ if not authenticated
 */
export const requireSessionOr = (
  request: Request,
  handler: (session: AuthSession) => Response | Promise<Response>,
): Promise<Response> => withSession(request, handler, () => redirect("/admin"));

/** Check owner role, return 403 if not owner */
const requireOwnerRole = (
  session: AuthSession,
  handler: (session: AuthSession) => Response | Promise<Response>,
): Response | Promise<Response> =>
  session.adminLevel === "owner"
    ? handler(session)
    : htmlResponse("Forbidden", 403);

/** CSRF form result type */
export type CsrfFormResult =
  | { ok: true; form: URLSearchParams }
  | { ok: false; response: Response };

/** Default cookie name for CSRF tokens */
const DEFAULT_CSRF_COOKIE = "csrf_token";

/** Generate CSRF cookie string */
export const csrfCookie = (
  token: string,
  path: string,
  cookieName = DEFAULT_CSRF_COOKIE,
): string =>
  `${cookieName}=${token}; HttpOnly; Secure; SameSite=Strict; Path=${path}; Max-Age=3600`;

/**
 * Parse form with CSRF validation (double-submit cookie pattern)
 */
export const requireCsrfForm = async (
  request: Request,
  onInvalid: (newToken: string) => Response,
  cookieName = DEFAULT_CSRF_COOKIE,
): Promise<CsrfFormResult> => {
  const cookies = parseCookies(request);
  const cookieCsrf = cookies.get(cookieName) || "";
  const form = await parseFormData(request);
  const formCsrf = form.get("csrf_token") || "";

  if (!cookieCsrf || !formCsrf || !validateCsrfToken(cookieCsrf, formCsrf)) {
    const newToken = generateSecureToken();
    return { ok: false, response: onInvalid(newToken) };
  }

  return { ok: true, form };
};

/** Auth form result type */
export type AuthFormResult =
  | { ok: true; session: AuthSession; form: URLSearchParams }
  | { ok: false; response: Response };

/**
 * Require authenticated session with parsed form and validated CSRF
 */
export const requireAuthForm = async (
  request: Request,
): Promise<AuthFormResult> => {
  const session = await getAuthenticatedSession(request);
  if (!session) {
    return { ok: false, response: redirect("/admin") };
  }

  const form = await parseFormData(request);
  const csrfToken = form.get("csrf_token") || "";
  if (!validateCsrfToken(session.csrfToken, csrfToken)) {
    return { ok: false, response: htmlResponse("Invalid CSRF token", 403) };
  }

  return { ok: true, session, form };
};

type FormHandler = (
  session: AuthSession,
  form: URLSearchParams,
) => Response | Promise<Response>;
type SessionHandler = (session: AuthSession) => Response | Promise<Response>;

/** Unwrap an AuthFormResult, optionally checking role */
const handleAuthForm = async (
  request: Request,
  requiredRole: AdminLevel | null,
  handler: FormHandler,
): Promise<Response> => {
  const auth = await requireAuthForm(request);
  if (!auth.ok) return auth.response;
  if (requiredRole && auth.session.adminLevel !== requiredRole) {
    return htmlResponse("Forbidden", 403);
  }
  return handler(auth.session, auth.form);
};

/** Handle request with auth form - unwrap AuthFormResult */
export const withAuthForm = (
  request: Request,
  handler: FormHandler,
): Promise<Response> => handleAuthForm(request, null, handler);

/** Require owner role - returns 403 if not owner, redirect if not authenticated */
export const requireOwnerOr = (
  request: Request,
  handler: SessionHandler,
): Promise<Response> =>
  requireSessionOr(request, (session) => requireOwnerRole(session, handler));

/** Handle request with owner auth form - requires owner role + CSRF validation */
export const withOwnerAuthForm = (
  request: Request,
  handler: FormHandler,
): Promise<Response> => handleAuthForm(request, "owner", handler);

/**
 * Get search param from request URL
 */
export const getSearchParam = (
  request: Request,
  key: string,
): string | null => {
  const url = new URL(request.url);
  return url.searchParams.get(key);
};
