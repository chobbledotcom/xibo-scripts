/**
 * Admin dashboard page template
 */

import type { AdminSession } from "#lib/types.ts";
import type { DashboardStatus } from "#xibo/types.ts";
import { Layout } from "#templates/layout.tsx";
import { AdminNav } from "#templates/admin/nav.tsx";

/**
 * Render Xibo CMS connection status section
 */
const ConnectionStatus = (
  { status }: { status: DashboardStatus },
): JSX.Element => {
  if (!status.connected) {
    return (
      <section>
        <h3>Xibo CMS Status</h3>
        <p class="error">
          Not connected —{" "}
          <a href="/admin/settings">configure API credentials</a>
        </p>
      </section>
    );
  }

  return (
    <section>
      <h3>Xibo CMS Status</h3>
      <p class="success">
        Connected{status.version && ` — CMS v${status.version}`}
      </p>
      <table>
        <thead>
          <tr>
            <th>Resource</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <a href="/admin/media">Media</a>
            </td>
            <td>{status.mediaCount ?? "—"}</td>
          </tr>
          <tr>
            <td>
              <a href="/admin/layouts">Layouts</a>
            </td>
            <td>{status.layoutCount ?? "—"}</td>
          </tr>
          <tr>
            <td>
              <a href="/admin/datasets">Datasets</a>
            </td>
            <td>{status.datasetCount ?? "—"}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
};

/**
 * Admin dashboard page - shows Xibo CMS status overview
 */
export const adminDashboardPage = (
  session: AdminSession,
  status: DashboardStatus,
): string =>
  String(
    <Layout title="Dashboard">
      <AdminNav session={session} />
      <h2>Dashboard</h2>
      <p>
        Welcome to Xibo Scripts. Use the navigation above to manage your Xibo
        CMS.
      </p>

      <ConnectionStatus status={status} />

      <section>
        <h3>Quick Links</h3>
        <ul>
          <li>
            <a href="/admin/media">Media Library</a>{" "}
            - Upload and manage media files
          </li>
          <li>
            <a href="/admin/layouts">Layouts</a>{" "}
            - Create and manage display layouts
          </li>
          <li>
            <a href="/admin/datasets">Datasets</a> - Manage datasets and data
          </li>
        </ul>
      </section>
    </Layout>,
  );
