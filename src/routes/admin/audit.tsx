/**
 * Audit log viewer routes (owner-only)
 *
 * Provides a read-only view of audit events for system administrators.
 */

import {
  getAuditEvents,
  countAuditEvents,
  type AuditEvent,
} from "#lib/db/audit-events.ts";
import type { AdminSession } from "#lib/types.ts";
import { defineRoutes } from "#routes/router.ts";
import { htmlResponse, requireOwnerOnly } from "#routes/utils.ts";
import { Layout } from "#templates/layout.tsx";
import { AdminNav } from "#templates/admin/nav.tsx";

/** Format a date string for display */
const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "medium" });
};

/** Badge color for different action types */
const actionBadge = (action: string): string => {
  if (action === "DELETE") return "color: #dc3545";
  if (action === "CREATE") return "color: #28a745";
  if (action === "UPDATE") return "color: #007bff";
  if (action === "PUBLISH") return "color: #6f42c1";
  if (action.includes("IMPERSONATE")) return "color: #fd7e14";
  if (action.includes("LOGIN")) return "color: #17a2b8";
  return "";
};

/**
 * Audit log page template
 */
const auditLogPage = (
  session: AdminSession,
  events: AuditEvent[],
  totalCount: number,
  filterAction?: string,
  filterResource?: string,
): string =>
  String(
    <Layout title="Audit Log">
      <AdminNav session={session} />
      <h2>Audit Log</h2>
      <p>{totalCount} total event(s) recorded.</p>
      <form method="GET" action="/admin/audit-log" style="display: flex; gap: 1rem; margin-bottom: 1rem;">
        <label>
          Action:
          <select name="action">
            <option value="">All</option>
            <option value="LOGIN" selected={filterAction === "LOGIN" || undefined}>LOGIN</option>
            <option value="LOGOUT" selected={filterAction === "LOGOUT" || undefined}>LOGOUT</option>
            <option value="LOGIN_FAILED" selected={filterAction === "LOGIN_FAILED" || undefined}>LOGIN_FAILED</option>
            <option value="CREATE" selected={filterAction === "CREATE" || undefined}>CREATE</option>
            <option value="UPDATE" selected={filterAction === "UPDATE" || undefined}>UPDATE</option>
            <option value="DELETE" selected={filterAction === "DELETE" || undefined}>DELETE</option>
            <option value="PUBLISH" selected={filterAction === "PUBLISH" || undefined}>PUBLISH</option>
            <option value="IMPERSONATE" selected={filterAction === "IMPERSONATE" || undefined}>IMPERSONATE</option>
          </select>
        </label>
        <label>
          Resource:
          <select name="resource">
            <option value="">All</option>
            <option value="business" selected={filterResource === "business" || undefined}>business</option>
            <option value="screen" selected={filterResource === "screen" || undefined}>screen</option>
            <option value="user" selected={filterResource === "user" || undefined}>user</option>
            <option value="media" selected={filterResource === "media" || undefined}>media</option>
            <option value="session" selected={filterResource === "session" || undefined}>session</option>
            <option value="settings" selected={filterResource === "settings" || undefined}>settings</option>
            <option value="menu_screen" selected={filterResource === "menu_screen" || undefined}>menu_screen</option>
            <option value="schedule" selected={filterResource === "schedule" || undefined}>schedule</option>
          </select>
        </label>
        <button type="submit">Filter</button>
      </form>
      {events.length === 0
        ? <p>No audit events found.</p>
        : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>User ID</th>
                <th>Action</th>
                <th>Resource</th>
                <th>ID</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr>
                  <td>{formatDate(e.created)}</td>
                  <td>{e.actor_user_id}</td>
                  <td><strong style={actionBadge(e.action)}>{e.action}</strong></td>
                  <td>{e.resource_type}</td>
                  <td>{e.resource_id ?? "—"}</td>
                  <td>{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </Layout>,
  );

/**
 * Handle GET /admin/audit-log
 */
const handleAuditLogGet = (request: Request): Promise<Response> =>
  requireOwnerOnly(request, async (session) => {
    const url = new URL(request.url);
    const filterAction = url.searchParams.get("action") || undefined;
    const filterResource = url.searchParams.get("resource") || undefined;

    // deno-lint-ignore no-explicit-any
    const query: Record<string, any> = { limit: 200 };
    if (filterAction) query.action = filterAction;
    if (filterResource) query.resourceType = filterResource;

    const [events, totalCount] = await Promise.all([
      getAuditEvents(query),
      countAuditEvents(),
    ]);

    return htmlResponse(
      auditLogPage(session, events, totalCount, filterAction, filterResource),
    );
  });

/** Audit log routes */
export const auditRoutes = defineRoutes({
  "GET /admin/audit-log": (request) => handleAuditLogGet(request),
});
