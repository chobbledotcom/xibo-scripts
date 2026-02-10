/**
 * Admin sessions management routes
 */

import { deleteOtherSessions, getAllSessions } from "#lib/db/sessions.ts";
import type { AdminSession } from "#lib/types.ts";
import { defineRoutes } from "#routes/router.ts";
import {
  htmlResponse,
  redirect,
  requireOwnerOr,
  withOwnerAuthForm,
} from "#routes/utils.ts";
import { Layout } from "#templates/layout.tsx";
import { AdminNav } from "#templates/admin/nav.tsx";

/**
 * Sessions admin page
 */
const sessionsPage = (
  sessionCount: number,
  session: AdminSession,
): string =>
  String(
    <Layout title="Sessions">
      <AdminNav session={session} />
      <h2>Active Sessions</h2>
      <p>There are currently {sessionCount} active session(s).</p>
      <form method="POST" action="/admin/sessions/clear">
        <input type="hidden" name="csrf_token" value={session.csrfToken} />
        <button type="submit">Clear Other Sessions</button>
      </form>
    </Layout>,
  );

/**
 * Handle GET /admin/sessions
 */
const handleSessionsGet = (request: Request): Promise<Response> =>
  requireOwnerOr(request, async (session) => {
    const sessions = await getAllSessions();
    return htmlResponse(sessionsPage(sessions.length, session));
  });

/**
 * Handle POST /admin/sessions/clear
 */
const handleSessionsClear = (request: Request): Promise<Response> =>
  withOwnerAuthForm(request, async (session) => {
    await deleteOtherSessions(session.token);
    return redirect("/admin/sessions");
  });

/** Sessions routes */
export const sessionsRoutes = defineRoutes({
  "GET /admin/sessions": (request) => handleSessionsGet(request),
  "POST /admin/sessions/clear": (request) => handleSessionsClear(request),
});
