/**
 * Admin screen management page templates
 */

import { renderError, renderFields } from "#lib/forms.tsx";
import { Raw } from "#lib/jsx/jsx-runtime.ts";
import type { AdminSession, Business, Screen } from "#lib/types.ts";
import type { XiboDisplay } from "#xibo/types.ts";
import { screenFields } from "#templates/fields.ts";
import { Layout } from "#templates/layout.tsx";
import { AdminNav, Breadcrumb } from "#templates/admin/nav.tsx";

/**
 * Screen create form page (with Xibo display picker)
 */
export const adminScreenCreatePage = (
  business: Business,
  availableDisplays: XiboDisplay[],
  session: AdminSession,
  error?: string,
): string =>
  String(
    <Layout title="Add Screen">
      <AdminNav session={session} />
      <Breadcrumb
        href={`/admin/business/${business.id}`}
        label={business.name}
      />
      <h1>Add Screen to {business.name}</h1>
      <Raw html={renderError(error)} />
      <form
        method="POST"
        action={`/admin/business/${business.id}/screen/create`}
      >
        <input type="hidden" name="csrf_token" value={session.csrfToken} />
        <Raw html={renderFields(screenFields)} />
        <label>
          Xibo Display
          <select name="xibo_display_id">
            <option value="">None</option>
            {availableDisplays.map((d) => (
              <option value={String(d.displayId)}>{d.display}</option>
            ))}
          </select>
        </label>
        <button type="submit">Create Screen</button>
      </form>
    </Layout>,
  );

/**
 * Screen detail page
 */
export const adminScreenDetailPage = (
  business: Business,
  screen: Screen,
  session: AdminSession,
  error?: string,
  success?: string,
): string =>
  String(
    <Layout title={screen.name}>
      <AdminNav session={session} />
      <Breadcrumb
        href={`/admin/business/${business.id}`}
        label={business.name}
      />
      <h1>{screen.name}</h1>
      <Raw html={renderError(error)} />
      {success && <div class="success">{success}</div>}

      <dl>
        <dt>Xibo Display ID</dt>
        <dd>{screen.xibo_display_id ?? "Not assigned"}</dd>
        <dt>Created</dt>
        <dd>{screen.created_at.slice(0, 10)}</dd>
      </dl>

      <h2>Danger Zone</h2>
      <form
        method="POST"
        action={`/admin/business/${business.id}/screen/${screen.id}/delete`}
      >
        <input type="hidden" name="csrf_token" value={session.csrfToken} />
        <button type="submit">Delete Screen</button>
      </form>
    </Layout>,
  );
