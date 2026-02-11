/**
 * User-facing navigation component
 */

import type { AdminSession } from "#lib/types.ts";
import type { DisplayBusiness } from "#lib/db/businesses.ts";

interface UserNavProps {
  session: AdminSession;
  activeBusiness?: DisplayBusiness;
  allBusinesses?: DisplayBusiness[];
}

/**
 * User navigation bar with business switcher
 */
export const UserNav = (
  { session, activeBusiness, allBusinesses }: UserNavProps,
): JSX.Element => (
  <nav>
    {session.impersonating && (
      <div style="background: #dc3545; color: white; padding: 0.5rem 1rem; text-align: center;">
        You are impersonating {session.impersonating.username} &mdash;{" "}
        <a
          href="/admin/stop-impersonating"
          style="color: white; font-weight: bold;"
        >
          Stop Impersonating
        </a>
      </div>
    )}
    <ul>
      <li>
        <a href="/dashboard/media">My Media</a>
      </li>
      <li>
        {session.impersonating
          ? <a href="/admin/stop-impersonating">Stop Impersonating</a>
          : <a href="/admin/logout">Logout</a>}
      </li>
    </ul>
    {allBusinesses && allBusinesses.length > 1 && activeBusiness && (
      <div>
        <form method="GET" action="/dashboard/media" style="display:inline">
          <label>
            Business:{" "}
            <select name="businessId" onchange="this.form.submit()">
              {allBusinesses.map((b) => (
                <option
                  value={String(b.id)}
                  selected={b.id === activeBusiness.id}
                >
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <noscript>
            <button type="submit">Switch</button>
          </noscript>
        </form>
      </div>
    )}
  </nav>
);

interface UserBreadcrumbProps {
  href: string;
  label: string;
}

/**
 * Breadcrumb link for user sub-pages
 */
export const UserBreadcrumb = (
  { href, label }: UserBreadcrumbProps,
): JSX.Element => (
  <p>
    <a href={href}>&larr; {label}</a>
  </p>
);
