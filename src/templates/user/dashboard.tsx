/**
 * User dashboard page templates
 *
 * Shows the user's businesses and a per-business overview with
 * screen count, product count, and quick links.
 */

import type { AdminSession } from "#lib/types.ts";
import type { DisplayBusiness } from "#lib/db/businesses.ts";
import { Layout } from "#templates/layout.tsx";
import { UserNav } from "#templates/user/nav.tsx";

/** Summary data for a single business on the dashboard */
export interface BusinessSummary {
  business: DisplayBusiness;
  screenCount: number;
  productCount: number;
}

/**
 * User home page — list businesses the user belongs to
 */
export const userDashboardPage = (
  session: AdminSession,
  businesses: DisplayBusiness[],
): string =>
  String(
    <Layout title="Dashboard">
      <UserNav session={session} />
      <h1>Dashboard</h1>

      {businesses.length === 0
        ? (
          <p>
            You are not assigned to any businesses yet. Contact your
            administrator.
          </p>
        )
        : (
          <div>
            <h2>My Businesses</h2>
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {businesses.map((b) => (
                    <tr>
                      <td>
                        <a href={`/dashboard/business/${b.id}`}>{b.name}</a>
                      </td>
                      <td>
                        <a href={`/dashboard/business/${b.id}/products`}>
                          Products
                        </a>
                        {" | "}
                        <a
                          href={`/dashboard/media?businessId=${b.id}`}
                        >
                          Media
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
    </Layout>,
  );

/**
 * Business overview page — screens, product count, quick links
 */
export const userBusinessDetailPage = (
  session: AdminSession,
  summary: BusinessSummary,
  success?: string,
  error?: string,
): string =>
  String(
    <Layout title={summary.business.name}>
      <UserNav session={session} />
      <p>
        <a href="/dashboard">&larr; Dashboard</a>
      </p>
      <h1>{summary.business.name}</h1>

      {success && <div class="success">{success}</div>}
      {error && <div class="error">{error}</div>}

      <section>
        <h2>Overview</h2>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Screens</th>
                <th>Products</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{summary.screenCount}</td>
                <td>{summary.productCount}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Quick Links</h2>
        <ul>
          <li>
            <a
              href={`/dashboard/business/${summary.business.id}/products`}
            >
              Manage Products
            </a>
          </li>
          <li>
            <a
              href={`/dashboard/media?businessId=${summary.business.id}`}
            >
              Manage Media
            </a>
          </li>
        </ul>
      </section>
    </Layout>,
  );
