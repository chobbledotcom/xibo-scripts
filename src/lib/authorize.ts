/**
 * Centralized authorization helper
 *
 * Provides a single point of truth for all access control decisions.
 * Routes should delegate to authorize() instead of ad-hoc role checks.
 *
 * The role hierarchy is: owner > manager > user
 */

import type { AdminLevel } from "#lib/types.ts";

/** Actions that can be performed on resources */
export type AuthAction =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "manage";

/** Resource types in the system */
export type AuthResource =
  | "business"
  | "screen"
  | "user"
  | "media"
  | "shared_media"
  | "menu_screen"
  | "product"
  | "settings"
  | "sessions"
  | "audit_log";

/** Actor identity for authorization decisions */
export type AuthActor = {
  adminLevel: AdminLevel;
  userId: number;
};

/**
 * Authorization rules matrix.
 *
 * Returns true if the actor is allowed to perform the action on the resource.
 * This does NOT check business membership — that's done separately by
 * withUserBusiness() for scoped resources. This checks role-level permissions.
 */
export const authorize = (
  actor: AuthActor,
  action: AuthAction,
  resource: AuthResource,
): boolean => {
  const { adminLevel } = actor;

  // Owner can do everything
  if (adminLevel === "owner") return true;

  // Manager permissions
  if (adminLevel === "manager") {
    // Managers cannot access owner-only resources
    if (resource === "settings" || resource === "sessions") return false;
    // Managers can read audit logs but not manage them
    if (resource === "audit_log") return action === "read";
    // Managers can manage users (create/read/update) but not delete owners
    if (resource === "user") return action !== "delete";
    // Managers can do everything else
    return true;
  }

  // User permissions (most restrictive)
  if (adminLevel === "user") {
    // Users can only access their own resources
    const userResources: AuthResource[] = [
      "product",
      "menu_screen",
      "media",
    ];
    if (userResources.includes(resource)) {
      return action !== "manage";
    }
    // Users can read businesses and screens they're assigned to
    if (resource === "business" || resource === "screen") {
      return action === "read";
    }
    return false;
  }

  // Default deny
  return false;
};

/**
 * Check if a role is at least manager level.
 */
export const isManagerOrAbove = (adminLevel: AdminLevel): boolean =>
  adminLevel === "owner" || adminLevel === "manager";

/**
 * Check if a role is owner.
 */
export const isOwner = (adminLevel: AdminLevel): boolean =>
  adminLevel === "owner";
