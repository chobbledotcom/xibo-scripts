/**
 * Shared utilities for route handlers
 */

import {
  constantTimeEqual,
  generateSecureToken,
  wrapKeyWithToken,
} from "#lib/crypto.ts";
import {
  createSession,
  deleteSession,
  getSession,
  onSessionCacheInvalidation,
} from "#lib/db/sessions.ts";
import {
  decryptAdminLevel,
  decryptUsername,
  getUserById,
} from "#lib/db/users.ts";
import { ErrorCode, logError } from "#lib/logger.ts";
import { nowMs } from "#lib/now.ts";
import type { AdminLevel, ImpersonationInfo } from "#lib/types.ts";
import { ok, err, type Result } from "#fp";
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

  const cookies = new Map<string, string>();
  for (const part of header.split(";")) {
    const [key, value] = part.trim().split("=");
    if (key && value) cookies.set(key, value);
  }
  return cookies;
};

/** Session with CSRF token, wrapped data key for private key derivation, and user role */
export type AuthSession = {
  token: string;
  csrfToken: string;
  wrappedDataKey: string | null;
  userId: number;
  adminLevel: AdminLevel;
  impersonating?: ImpersonationInfo;
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

/** Standard security attributes for all cookies */
const COOKIE_ATTRS = "HttpOnly; Secure; SameSite=Strict";

/**
 * Build a cookie string with standard security attributes.
 */
export const buildCookie = (
  name: string,
  value: string,
  path: string,
  maxAge: number,
): string =>
  `${name}=${value}; ${COOKIE_ATTRS}; Path=${path}; Max-Age=${maxAge}`;

/**
 * Build a cookie-clearing string (Max-Age=0) with standard security attributes.
 */
export const clearCookie = (name: string, path: string): string =>
  buildCookie(name, "", path, 0);

/** Cookie name for the admin's original session during impersonation */
const ADMIN_SESSION_COOKIE = "__Host-admin-session";

/**
 * Get authenticated session if valid (with 10s TTL cache)
 */
export const getAuthenticatedSession = async (
  request: Request,
): Promise<AuthSession | null> => {
  const cookies = parseCookies(request);
  const token = cookies.get("__Host-session");
  if (!token) return null;

  // Detect impersonation: if admin session cookie exists, we're impersonating
  const adminToken = cookies.get(ADMIN_SESSION_COOKIE);

  // Check auth session cache (cache key includes admin token to differentiate)
  const cacheKey = adminToken ? `${token}:imp` : token;
  const cached = authSessionCache.get(cacheKey);
  if (cached) {
    if (Date.now() - cached.cachedAt <= AUTH_SESSION_CACHE_TTL_MS) {
      return cached.session;
    }
    authSessionCache.delete(cacheKey);
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

  // Build impersonation info if admin session cookie is present
  let impersonating: ImpersonationInfo | undefined;
  if (adminToken) {
    const username = await decryptUsername(user);
    impersonating = { username, userId: session.user_id };
  }

  const authSession: AuthSession = {
    token,
    csrfToken: session.csrf_token,
    wrappedDataKey: session.wrapped_data_key,
    userId: session.user_id,
    adminLevel,
    impersonating,
  };

  authSessionCache.set(cacheKey, { session: authSession, cachedAt: Date.now() });

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
 * Create redirect response with an error message as query parameter (PRG pattern)
 */
export const redirectWithError = (
  basePath: string,
  message: string,
): Response => redirect(`${basePath}?error=${encodeURIComponent(message)}`);

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

/** Role check function type */
type RoleCheck = (session: AuthSession) => boolean;

/** Check if session is owner */
const isOwner: RoleCheck = (session) => session.adminLevel === "owner";

/** Check if session is manager or above */
const isManagerOrAbove: RoleCheck = (session) =>
  session.adminLevel === "owner" || session.adminLevel === "manager";

/** Generic role guard: return 403 if check fails */
const requireRole = (
  check: RoleCheck,
  session: AuthSession,
  handler: (session: AuthSession) => Response | Promise<Response>,
): Response | Promise<Response> =>
  check(session) ? handler(session) : htmlResponse("Forbidden", 403);

/** CSRF form result type */
export type CsrfFormResult = Result<URLSearchParams>;

/** Default cookie name for CSRF tokens */
const DEFAULT_CSRF_COOKIE = "csrf_token";

/** CSRF cookie max-age (1 hour) */
const CSRF_MAX_AGE = 3600;

/** Generate CSRF cookie string */
export const csrfCookie = (
  token: string,
  path: string,
  cookieName = DEFAULT_CSRF_COOKIE,
): string =>
  buildCookie(cookieName, token, path, CSRF_MAX_AGE);

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
    return err(onInvalid(newToken));
  }

  return ok(form);
};

/** Auth form result type */
export type AuthFormResult = Result<{ session: AuthSession; form: URLSearchParams }>;

/**
 * Require authenticated session with parsed form and validated CSRF
 */
export const requireAuthForm = async (
  request: Request,
): Promise<AuthFormResult> => {
  const session = await getAuthenticatedSession(request);
  if (!session) {
    return err(redirect("/admin"));
  }

  const form = await parseFormData(request);
  const csrfToken = form.get("csrf_token") || "";
  if (!validateCsrfToken(session.csrfToken, csrfToken)) {
    return err(htmlResponse("Invalid CSRF token", 403));
  }

  return ok({ session, form });
};

type FormHandler = (
  session: AuthSession,
  form: URLSearchParams,
) => Response | Promise<Response>;
type SessionHandler = (session: AuthSession) => Response | Promise<Response>;

/** Unwrap an AuthFormResult, optionally checking role */
const handleAuthForm = async (
  request: Request,
  roleCheck: RoleCheck | null,
  handler: FormHandler,
): Promise<Response> => {
  const auth = await requireAuthForm(request);
  if (!auth.ok) return auth.response;
  if (roleCheck && !roleCheck(auth.value.session)) {
    return htmlResponse("Forbidden", 403);
  }
  return handler(auth.value.session, auth.value.form);
};

/** Handle request with auth form - unwrap AuthFormResult */
export const withAuthForm = (
  request: Request,
  handler: FormHandler,
): Promise<Response> => handleAuthForm(request, null, handler);

/** Create a session-guarded route that also checks a role predicate */
const sessionWithRole = (check: RoleCheck) =>
  (request: Request, handler: SessionHandler): Promise<Response> =>
    requireSessionOr(request, (session) =>
      requireRole(check, session, handler));

/** Require owner role - returns 403 if not owner, redirect if not authenticated */
export const requireOwnerOnly = sessionWithRole(isOwner);

/** Require manager or above - returns 403 if user role, redirect if not authenticated */
export const requireManagerOrAbove = sessionWithRole(isManagerOrAbove);

/** Handle request with owner auth form - requires owner role + CSRF validation */
export const withOwnerAuthForm = (
  request: Request,
  handler: FormHandler,
): Promise<Response> => handleAuthForm(request, isOwner, handler);

/** Handle request with manager-or-above auth form - requires manager or owner role + CSRF validation */
export const withManagerAuthForm = (
  request: Request,
  handler: FormHandler,
): Promise<Response> => handleAuthForm(request, isManagerOrAbove, handler);

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

/** Session expiry duration (24 hours) */
const SESSION_EXPIRY_MS = 86_400_000;


/**
 * Create a new authenticated session with a wrapped data key.
 * Shared by login and impersonation flows.
 * Returns the session token for cookie setting.
 */
export const createSessionWithKey = async (
  dataKey: CryptoKey,
  userId: number,
): Promise<string> => {
  const token = generateSecureToken();
  const csrfToken = generateSecureToken();
  const expires = nowMs() + SESSION_EXPIRY_MS;
  const wrappedDataKey = await wrapKeyWithToken(dataKey, token);
  await createSession(token, csrfToken, expires, wrappedDataKey, userId);
  return token;
};

/** Session cookie max-age (24 hours) */
const SESSION_MAX_AGE_SECONDS = 86400;

/**
 * Build a __Host-session cookie string from a token.
 */
export const sessionCookieValue = (token: string): string =>
  buildCookie("__Host-session", token, "/", SESSION_MAX_AGE_SECONDS);

/**
 * Create a redirect response with multiple Set-Cookie headers.
 */
export const redirectWithCookies = (
  location: string,
  cookies: string[],
): Response => {
  const headers = new Headers({ location });
  for (const cookie of cookies) {
    headers.append("set-cookie", cookie);
  }
  return new Response(null, { status: 302, headers });
};
