/**
 * Immutable audit event logging
 *
 * Records critical actions (auth, impersonation, publish, CRUD)
 * with actor, resource, and result information.
 * Entries are append-only — never updated or deleted.
 */

import { getDb, queryAll, queryOne } from "#lib/db/client.ts";
import { nowIso } from "#lib/now.ts";

/** Actions tracked by the audit system */
export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "LOGIN_FAILED"
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "PUBLISH"
  | "IMPERSONATE"
  | "STOP_IMPERSONATE";

/** Resource types for audit events */
export type AuditResourceType =
  | "business"
  | "screen"
  | "menu_screen"
  | "user"
  | "media"
  | "product"
  | "session"
  | "settings"
  | "schedule";

/** Stored audit event row */
export interface AuditEvent {
  id: number;
  created: string;
  actor_user_id: number;
  action: string;
  resource_type: string;
  resource_id: string | null;
  detail: string;
}

/**
 * Log an audit event.
 * This is the primary function for recording critical actions.
 */
export const logAuditEvent = async (event: {
  actorUserId: number;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string | number | null;
  detail: string;
}): Promise<void> => {
  await getDb().execute({
    sql: `INSERT INTO audit_events (created, actor_user_id, action, resource_type, resource_id, detail)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      nowIso(),
      event.actorUserId,
      event.action,
      event.resourceType,
      event.resourceId != null ? String(event.resourceId) : null,
      event.detail,
    ],
  });
};

/** Query options for fetching audit events */
export type AuditEventQuery = {
  limit?: number;
  action?: AuditAction;
  resourceType?: AuditResourceType;
  actorUserId?: number;
};

/**
 * Get audit events with optional filtering.
 * Returns most recent events first.
 */
export const getAuditEvents = (
  opts: AuditEventQuery = {},
): Promise<AuditEvent[]> => {
  const limit = opts.limit ?? 100;
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (opts.action) {
    conditions.push("action = ?");
    args.push(opts.action);
  }
  if (opts.resourceType) {
    conditions.push("resource_type = ?");
    args.push(opts.resourceType);
  }
  if (opts.actorUserId !== undefined) {
    conditions.push("actor_user_id = ?");
    args.push(opts.actorUserId);
  }

  const where = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  return queryAll<AuditEvent>(
    `SELECT id, created, actor_user_id, action, resource_type, resource_id, detail
     FROM audit_events ${where} ORDER BY id DESC LIMIT ?`,
    [...args, limit],
  );
};

/**
 * Get a single audit event by ID.
 */
export const getAuditEventById = (id: number): Promise<AuditEvent | null> =>
  queryOne<AuditEvent>(
    "SELECT id, created, actor_user_id, action, resource_type, resource_id, detail FROM audit_events WHERE id = ?",
    [id],
  );

/**
 * Count total audit events (for pagination / observability).
 */
export const countAuditEvents = async (): Promise<number> => {
  const row = await queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM audit_events",
    [],
  );
  return row?.count ?? 0;
};
