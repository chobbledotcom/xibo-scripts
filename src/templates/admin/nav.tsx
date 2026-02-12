/**
 * Shared admin navigation component
 */

import type { AdminSession } from "#lib/types.ts";

interface AdminNavProps {
  session?: AdminSession;
}

/** Check if session role is manager or above */
const isManagerOrAbove = (session?: AdminSession): boolean =>
  session?.adminLevel === "owner" || session?.adminLevel === "manager";

/**
 * Universal admin navigation - shown at top of all admin pages
 * - Owner: all links
 * - Manager: all except Settings and Sessions
 * - User: Dashboard and Logout only
 */
export const AdminNav = ({ session }: AdminNavProps = {}): JSX.Element => (
  <nav>
    {session?.impersonating && (
      <div style="background: #dc3545; color: white; padding: 0.5rem 1rem; text-align: center;">
        You are impersonating {session.impersonating.username} &mdash;{" "}
        <a href="/admin/stop-impersonating" style="color: white; font-weight: bold;">
          Stop Impersonating
        </a>
      </div>
    )}
    <ul>
      <li>
        <a href="/admin/">Dashboard</a>
      </li>
      {isManagerOrAbove(session) && (
        <li>
          <a href="/admin/businesses">Businesses</a>
        </li>
      )}
      {isManagerOrAbove(session) && (
        <li>
          <a href="/admin/menuboards">Menu Boards</a>
        </li>
      )}
      {isManagerOrAbove(session) && (
        <li>
          <a href="/admin/media">Media</a>
        </li>
      )}
      {isManagerOrAbove(session) && (
        <li>
          <a href="/admin/media/shared">Shared Photos</a>
        </li>
      )}
      {isManagerOrAbove(session) && (
        <li>
          <a href="/admin/layouts">Layouts</a>
        </li>
      )}
      {isManagerOrAbove(session) && (
        <li>
          <a href="/admin/datasets">Datasets</a>
        </li>
      )}
      {isManagerOrAbove(session) && (
        <li>
          <a href="/admin/users">Users</a>
        </li>
      )}
      {session?.adminLevel === "owner" && (
        <li>
          <a href="/admin/settings">Settings</a>
        </li>
      )}
      {session?.adminLevel === "owner" && (
        <li>
          <a href="/admin/sessions">Sessions</a>
        </li>
      )}
      {session?.adminLevel === "owner" && (
        <li>
          <a href="/admin/audit-log">Audit Log</a>
        </li>
      )}
      <li>
        {session?.impersonating
          ? <a href="/admin/stop-impersonating">Stop Impersonating</a>
          : <a href="/admin/logout">Logout</a>}
      </li>
    </ul>
  </nav>
);

interface BreadcrumbProps {
  href: string;
  label: string;
}

/**
 * Breadcrumb link for sub-pages
 */
export const Breadcrumb = ({ href, label }: BreadcrumbProps): JSX.Element => (
  <p>
    <a href={href}>&larr; {label}</a>
  </p>
);
