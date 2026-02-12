/**
 * Admin authentication routes - login and logout
 */

import { logAuditEvent } from "#lib/db/audit-events.ts";
import {
  clearLoginAttempts,
  isLoginRateLimited,
  recordFailedLogin,
} from "#lib/db/login-attempts.ts";
import { deleteSession } from "#lib/db/sessions.ts";
import { getUserByUsername, verifyUserPassword } from "#lib/db/users.ts";
import { validateForm } from "#lib/forms.tsx";
import { loginResponse } from "#routes/admin/dashboard.ts";
import { clearSessionCookie } from "#routes/route-helpers.ts";
import { defineRoutes } from "#routes/router.ts";
import type { ServerContext } from "#routes/types.ts";
import {
  createNewSession,
  getClientIp,
  parseFormData,
  redirect,
  sessionCookieValue,
  withSession,
} from "#routes/utils.ts";
import { loginFields, type LoginFormValues } from "#templates/fields.ts";
import { getEnv } from "#lib/env.ts";

/** Random delay between 100-200ms to prevent timing attacks */
const randomDelay = (): Promise<void> =>
  getEnv("TEST_SKIP_LOGIN_DELAY")
    ? Promise.resolve()
    : new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 100));

/** Create a session and redirect to /admin */
const createLoginSession = async (
  userId: number,
): Promise<Response> => {
  const token = await createNewSession(userId);
  return redirect("/admin", sessionCookieValue(token));
};

/**
 * Handle POST /admin/login
 */
const handleAdminLogin = async (
  request: Request,
  server?: ServerContext,
): Promise<Response> => {
  await randomDelay();

  const clientIp = getClientIp(request, server);

  // Check rate limiting
  if (await isLoginRateLimited(clientIp)) {
    return loginResponse(
      "Too many login attempts. Please try again later.",
      429,
    );
  }

  const form = await parseFormData(request);
  const validation = validateForm<LoginFormValues>(form, loginFields);

  if (!validation.valid) {
    return loginResponse(validation.error, 400);
  }

  const { username, password } = validation.values;

  // Look up user by username
  const user = await getUserByUsername(username);
  if (!user) {
    await recordFailedLogin(clientIp);
    return loginResponse("Invalid credentials", 401);
  }

  // Verify password
  const passwordHash = await verifyUserPassword(user, password);
  if (!passwordHash) {
    await recordFailedLogin(clientIp);
    return loginResponse("Invalid credentials", 401);
  }

  // Clear failed attempts on successful login
  await clearLoginAttempts(clientIp);

  await logAuditEvent({
    actorUserId: user.id,
    action: "LOGIN",
    resourceType: "session",
    detail: "Successful login",
  });

  return createLoginSession(user.id);
};

/**
 * Handle GET /admin/logout
 */
const handleAdminLogout = (request: Request): Promise<Response> =>
  withSession(
    request,
    async (session) => {
      await logAuditEvent({
        actorUserId: session.userId,
        action: "LOGOUT",
        resourceType: "session",
        detail: "User logged out",
      });
      await deleteSession(session.token);
      return redirect("/admin", clearSessionCookie);
    },
    () => redirect("/admin", clearSessionCookie),
  );

/** Authentication routes */
export const authRoutes = defineRoutes({
  "GET /admin/login": () => redirect("/admin"),
  "POST /admin/login": (request, _, server) =>
    handleAdminLogin(request, server),
  "GET /admin/logout": handleAdminLogout,
});
