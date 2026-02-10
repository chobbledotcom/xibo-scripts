/**
 * Admin dashboard page template
 */

import type { AdminSession } from "#lib/types.ts";
import { Layout } from "#templates/layout.tsx";
import { AdminNav } from "#templates/admin/nav.tsx";

/**
 * Admin dashboard page - shows Xibo CMS status overview
 */
export const adminDashboardPage = (
  session: AdminSession,
): string =>
  String(
    <Layout title="Dashboard">
      <AdminNav session={session} />
      <h2>Dashboard</h2>
      <p>Welcome to Xibo Scripts. Use the navigation above to manage your Xibo CMS.</p>

      <section>
        <h3>Quick Links</h3>
        <ul>
          <li><a href="/admin/menuboards">Menu Boards</a> - Manage menu boards, categories, and products</li>
          <li><a href="/admin/media">Media Library</a> - Upload and manage media files</li>
          <li><a href="/admin/layouts">Layouts</a> - Create and manage display layouts</li>
          <li><a href="/admin/datasets">Datasets</a> - Manage datasets and data</li>
        </ul>
      </section>
    </Layout>
  );
