/**
 * Admin impersonation routes - manager or above
 */

import { unwrapKeyWithToken } from "#lib/crypto.ts";
import { logActivity } from "#lib/db/activityLog.ts";
import { deleteSession } from "#lib/db/sessions.ts";
import {
  decryptAdminLevel,
  decryptUsername,
  getUserById,
} from "#lib/db/users.ts";
import { clearSessionCookie } from "#routes/route-helpers.ts";
import { defineRoutes } from "#routes/router.ts";
import type { RouteParams } from "#routes/router.ts";
import {
  createSessionWithKey,
  getAuthenticatedSession,
  htmlResponse,
  parseCookies,
  redirect,
  redirectWithCookies,
  sessionCookieValue,
  withManagerAuthForm,
} from "#routes/utils.ts";

/** Cookie name for storing the admin's original session during impersonation */
export const ADMIN_SESSION_COOKIE = "__Host-admin-session";

/** Build the admin session cookie string */
const adminSessionCookie = (token: string): string =>
  `${ADMIN_SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`;

/** Clear the admin session cookie */
const clearAdminSessionCookie =
  `${ADMIN_SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;

/**
 * Handle POST /admin/users/:id/impersonate
 * Manager or above can impersonate user-role users.
 * Owners can impersonate any non-owner user.
 */
const handleImpersonate = (
  request: Request,
  params: RouteParams,
): Promise<Response> =>
  withManagerAuthForm(request, async (session) => {
    const targetUserId = Number(params.id);

    // Cannot impersonate self
    if (targetUserId === session.userId) {
      return htmlResponse("Cannot impersonate yourself", 400);
    }

    // Look up target user
    const targetUser = await getUserById(targetUserId);
    if (!targetUser) {
      return htmlResponse("User not found", 404);
    }

    const targetLevel = await decryptAdminLevel(targetUser);

    // Managers can only impersonate user-role users
    if (session.adminLevel === "manager" && targetLevel !== "user") {
      return htmlResponse("Forbidden", 403);
    }

    // Owners cannot impersonate other owners
    if (targetLevel === "owner") {
      return htmlResponse("Cannot impersonate an owner", 403);
    }

    // Need wrapped data key to transfer to impersonation session
    if (!session.wrappedDataKey) {
      return htmlResponse("Cannot impersonate: session lacks data key", 500);
    }

    // Unwrap data key using admin's session token, create impersonation session
    const dataKey = await unwrapKeyWithToken(
      session.wrappedDataKey,
      session.token,
    );
    const newToken = await createSessionWithKey(dataKey, targetUserId);

    const targetUsername = await decryptUsername(targetUser);
    await logActivity(
      `Impersonated user "${targetUsername}" (id=${targetUserId})`,
    );

    // Set both cookies: store admin session, switch to impersonation session
    return redirectWithCookies("/admin", [
      adminSessionCookie(session.token),
      sessionCookieValue(newToken),
    ]);
  });

/**
 * Handle GET /admin/stop-impersonating
 * Restore the admin session and clean up the impersonation session.
 */
const handleStopImpersonating = async (
  request: Request,
): Promise<Response> => {
  const cookies = parseCookies(request);
  const adminToken = cookies.get(ADMIN_SESSION_COOKIE);
  const currentToken = cookies.get("__Host-session");

  if (!adminToken) {
    // Not impersonating — just redirect
    return redirect("/admin");
  }

  // Delete the impersonation session
  if (currentToken) {
    await deleteSession(currentToken);
  }

  // Verify the admin session is still valid
  const adminSession = await getAuthenticatedSession(
    new Request("http://localhost", {
      headers: { cookie: `__Host-session=${adminToken}` },
    }),
  );

  if (!adminSession) {
    // Admin session expired — redirect to login, clear both cookies
    return redirectWithCookies("/admin", [
      clearSessionCookie,
      clearAdminSessionCookie,
    ]);
  }

  await logActivity("Stopped impersonating");

  // Restore admin session cookie, clear admin backup cookie
  return redirectWithCookies("/admin/users", [
    sessionCookieValue(adminToken),
    clearAdminSessionCookie,
  ]);
};

/** Impersonation routes */
export const impersonationRoutes = defineRoutes({
  "POST /admin/users/:id/impersonate": handleImpersonate,
  "GET /admin/stop-impersonating": handleStopImpersonating,
});
