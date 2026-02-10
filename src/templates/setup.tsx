/**
 * Setup page templates - initial configuration
 */

import { renderError, renderFields } from "#lib/forms.tsx";
import { Raw } from "#lib/jsx/jsx-runtime.ts";
import { setupFields } from "#templates/fields.ts";
import { Layout } from "#templates/layout.tsx";

/**
 * Initial setup page
 */
export const setupPage = (error?: string, csrfToken?: string): string =>
  String(
    <Layout title="Setup">
        <h1>Initial Setup</h1>
        <p>Welcome! Please configure your Xibo CMS management tool.</p>
        <Raw html={renderError(error)} />
        <form method="POST" action="/setup/">
          {csrfToken && <input type="hidden" name="csrf_token" value={csrfToken} />}
          <Raw html={renderFields(setupFields)} />
          <button type="submit">Complete Setup</button>
        </form>
    </Layout>
  );

/**
 * Setup complete page
 */
export const setupCompletePage = (): string =>
  String(
    <Layout title="Setup Complete">
        <h1>Setup Complete!</h1>
        <div class="success">
          <p>Your Xibo CMS management tool has been configured successfully.</p>
        </div>
        <p>
          <a href="/admin/"><b>Go to Admin Dashboard</b></a>
        </p>
    </Layout>
  );
