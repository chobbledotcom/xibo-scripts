/**
 * Admin business management page templates
 */

import { renderError, renderFields } from "#lib/forms.tsx";
import { Raw } from "#lib/jsx/jsx-runtime.ts";
import type { AdminLevel, AdminSession, Business, Screen } from "#lib/types.ts";
import { businessFields } from "#templates/fields.ts";
import { Layout } from "#templates/layout.tsx";
import { AdminNav, Breadcrumb } from "#templates/admin/nav.tsx";

/** Displayable user info for business detail */
export interface BusinessUser {
  id: number;
  username: string;
  adminLevel: AdminLevel;
}

/**
 * Business list page
 */
export const adminBusinessesPage = (
  businesses: Business[],
  session: AdminSession,
  error?: string,
  success?: string,
): string =>
  String(
    <Layout title="Businesses">
      <AdminNav session={session} />
      <h1>Businesses</h1>
      <Raw html={renderError(error)} />
      {success && <div class="success">{success}</div>}

      <p>
        <a href="/admin/business/create">Create Business</a>
      </p>

      {businesses.length === 0
        ? <p>No businesses yet.</p>
        : (
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Xibo Folder</th>
                  <th>Xibo Dataset</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((b) => (
                  <tr>
                    <td>
                      <a href={`/admin/business/${b.id}`}>{b.name}</a>
                    </td>
                    <td>{b.xibo_folder_id ?? "—"}</td>
                    <td>{b.xibo_dataset_id ?? "—"}</td>
                    <td>{b.created_at.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Layout>,
  );

/**
 * Business create form page
 */
export const adminBusinessCreatePage = (
  session: AdminSession,
  error?: string,
): string =>
  String(
    <Layout title="Create Business">
      <AdminNav session={session} />
      <Breadcrumb href="/admin/businesses" label="Businesses" />
      <h1>Create Business</h1>
      <Raw html={renderError(error)} />
      <form method="POST" action="/admin/business/create">
        <input type="hidden" name="csrf_token" value={session.csrfToken} />
        <Raw html={renderFields(businessFields)} />
        <button type="submit">Create Business</button>
      </form>
    </Layout>,
  );

/**
 * Business detail page (screens + assigned users)
 */
export const adminBusinessDetailPage = (
  business: Business,
  screens: Screen[],
  assignedUsers: BusinessUser[],
  availableUsers: BusinessUser[],
  session: AdminSession,
  error?: string,
  success?: string,
): string =>
  String(
    <Layout title={business.name}>
      <AdminNav session={session} />
      <Breadcrumb href="/admin/businesses" label="Businesses" />
      <h1>{business.name}</h1>
      <Raw html={renderError(error)} />
      {success && <div class="success">{success}</div>}

      <h2>Edit Business</h2>
      <form method="POST" action={`/admin/business/${business.id}`}>
        <input type="hidden" name="csrf_token" value={session.csrfToken} />
        <Raw html={renderFields(businessFields)} />
        <button type="submit">Update</button>
      </form>

      <h2>Screens</h2>
      <p>
        <a href={`/admin/business/${business.id}/screen/create`}>
          Add Screen
        </a>
      </p>
      {screens.length === 0
        ? <p>No screens yet.</p>
        : (
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Xibo Display</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {screens.map((s) => (
                  <tr>
                    <td>
                      <a
                        href={`/admin/business/${business.id}/screen/${s.id}`}
                      >
                        {s.name}
                      </a>
                    </td>
                    <td>{s.xibo_display_id ?? "—"}</td>
                    <td>
                      <form
                        class="inline"
                        method="POST"
                        action={`/admin/business/${business.id}/screen/${s.id}/delete`}
                      >
                        <input
                          type="hidden"
                          name="csrf_token"
                          value={session.csrfToken}
                        />
                        <button type="submit">Delete</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <h2>Assigned Users</h2>
      {assignedUsers.length === 0
        ? <p>No users assigned.</p>
        : (
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignedUsers.map((u) => (
                  <tr>
                    <td>{u.username}</td>
                    <td>
                      <form
                        class="inline"
                        method="POST"
                        action={`/admin/business/${business.id}/remove-user`}
                      >
                        <input
                          type="hidden"
                          name="csrf_token"
                          value={session.csrfToken}
                        />
                        <input
                          type="hidden"
                          name="user_id"
                          value={String(u.id)}
                        />
                        <button type="submit">Remove</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {availableUsers.length > 0 && (
        <div>
          <h3>Assign User</h3>
          <form
            method="POST"
            action={`/admin/business/${business.id}/assign-user`}
          >
            <input
              type="hidden"
              name="csrf_token"
              value={session.csrfToken}
            />
            <label>
              User
              <select name="user_id" required>
                <option value="">Select a user</option>
                {availableUsers.map((u) => (
                  <option value={String(u.id)}>{u.username}</option>
                ))}
              </select>
            </label>
            <button type="submit">Assign</button>
          </form>
        </div>
      )}

      <h2>Danger Zone</h2>
      <form
        method="POST"
        action={`/admin/business/${business.id}/delete`}
      >
        <input type="hidden" name="csrf_token" value={session.csrfToken} />
        <button type="submit">Delete Business</button>
      </form>
    </Layout>,
  );
