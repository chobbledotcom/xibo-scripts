/**
 * Admin settings routes
 */

import {
  getXiboApiUrl,
  getXiboClientId,
  updateXiboCredentials,
} from "#lib/db/settings.ts";
import { renderFields, validateForm } from "#lib/forms.tsx";
import { Raw } from "#lib/jsx/jsx-runtime.ts";
import type { AdminSession } from "#lib/types.ts";
import { defineRoutes } from "#routes/router.ts";
import {
  htmlResponse,
  redirectWithSuccess,
  requireOwnerOr,
  withOwnerAuthForm,
} from "#routes/utils.ts";
import {
  changePasswordFields,
  type ChangePasswordFormValues,
  xiboCredentialsFields,
  type XiboCredentialsFormValues,
} from "#templates/fields.ts";
import { Layout } from "#templates/layout.tsx";
import { AdminNav } from "#templates/admin/nav.tsx";
import { settingsApi } from "#lib/db/settings.ts";
import { loadXiboConfig, testConnection } from "#xibo/client.ts";
import type { ConnectionTestResult } from "#xibo/types.ts";

/**
 * Admin settings page
 */
const settingsPage = (
  session: AdminSession,
  xiboUrl: string | null,
  xiboClientId: string | null,
  connectionResult?: ConnectionTestResult,
  success?: string,
): string =>
  String(
    <Layout title="Settings">
      <AdminNav session={session} />
      <h2>Settings</h2>

      {success && <div class="success">{success}</div>}

      <section>
        <h3>Xibo CMS Connection</h3>
        <p>Current URL: {xiboUrl || "Not configured"}</p>
        <p>Client ID: {xiboClientId || "Not configured"}</p>

        {connectionResult && (
          <div class={connectionResult.success ? "success" : "error"}>
            <p>
              {connectionResult.success ? "Connected" : "Connection failed"}
              {connectionResult.version &&
                ` — CMS v${connectionResult.version}`}
            </p>
            {!connectionResult.success && <p>{connectionResult.message}</p>}
          </div>
        )}

        <form method="POST" action="/admin/settings/xibo">
          <input type="hidden" name="csrf_token" value={session.csrfToken} />
          <Raw html={renderFields(xiboCredentialsFields)} />
          <button type="submit">Update Xibo Credentials</button>
        </form>

        {xiboUrl && (
          <form method="POST" action="/admin/settings/test">
            <input type="hidden" name="csrf_token" value={session.csrfToken} />
            <button type="submit">Test Connection</button>
          </form>
        )}
      </section>

      <section>
        <h3>Change Password</h3>
        <form method="POST" action="/admin/settings/password">
          <input type="hidden" name="csrf_token" value={session.csrfToken} />
          <Raw html={renderFields(changePasswordFields)} />
          <button type="submit">Change Password</button>
        </form>
      </section>
    </Layout>,
  );

/**
 * Handle GET /admin/settings
 */
const handleSettingsGet = (request: Request): Promise<Response> =>
  requireOwnerOr(request, async (session) => {
    const xiboUrl = await getXiboApiUrl();
    const xiboClientId = await getXiboClientId();
    const url = new URL(request.url);
    const success = url.searchParams.get("success") || undefined;
    return htmlResponse(
      settingsPage(session, xiboUrl, xiboClientId, undefined, success),
    );
  });

/**
 * Handle POST /admin/settings/xibo
 */
const handleXiboUpdate = (request: Request): Promise<Response> =>
  withOwnerAuthForm(request, async (_session, form) => {
    const validation = validateForm<XiboCredentialsFormValues>(
      form,
      xiboCredentialsFields,
    );
    if (!validation.valid) {
      return htmlResponse(validation.error, 400);
    }

    const { xibo_api_url, xibo_client_id, xibo_client_secret } =
      validation.values;
    await updateXiboCredentials(
      xibo_api_url,
      xibo_client_id,
      xibo_client_secret,
    );
    return redirectWithSuccess("/admin/settings", "Xibo credentials updated");
  });

/**
 * Handle POST /admin/settings/test — test Xibo API connection
 */
const handleConnectionTest = (request: Request): Promise<Response> =>
  withOwnerAuthForm(request, async (session, _form) => {
    const config = await loadXiboConfig();
    if (!config) {
      const xiboUrl = await getXiboApiUrl();
      const xiboClientIdVal = await getXiboClientId();
      return htmlResponse(
        settingsPage(session, xiboUrl, xiboClientIdVal, {
          success: false,
          message: "Xibo API credentials are not configured",
        }),
      );
    }

    const result = await testConnection(config);
    const xiboUrl = await getXiboApiUrl();
    const xiboClientIdVal = await getXiboClientId();
    return htmlResponse(
      settingsPage(session, xiboUrl, xiboClientIdVal, result),
    );
  });

/**
 * Handle POST /admin/settings/password
 */
const handlePasswordChange = (request: Request): Promise<Response> =>
  withOwnerAuthForm(request, async (session, form) => {
    const validation = validateForm<ChangePasswordFormValues>(
      form,
      changePasswordFields,
    );
    if (!validation.valid) {
      return htmlResponse(validation.error, 400);
    }

    const { current_password, new_password, new_password_confirm } =
      validation.values;

    if (new_password.length < 8) {
      return htmlResponse("New password must be at least 8 characters", 400);
    }
    if (new_password !== new_password_confirm) {
      return htmlResponse("Passwords do not match", 400);
    }

    // Verify current password
    const { getUserById, verifyUserPassword } = await import(
      "#lib/db/users.ts"
    );
    const user = (await getUserById(session.userId))!;
    const passwordHash = await verifyUserPassword(user, current_password);
    if (!passwordHash || !session.wrappedDataKey) {
      return htmlResponse("Invalid current password", 400);
    }

    const success = await settingsApi.updateUserPassword(
      session.userId,
      passwordHash,
      user.wrapped_data_key!,
      new_password,
    );

    if (!success) {
      return htmlResponse("Failed to change password", 500);
    }

    return redirectWithSuccess(
      "/admin/settings",
      "Password changed. Please log in again.",
    );
  });

/** Settings routes */
export const settingsRoutes = defineRoutes({
  "GET /admin/settings": (request) => handleSettingsGet(request),
  "POST /admin/settings/xibo": (request) => handleXiboUpdate(request),
  "POST /admin/settings/test": (request) => handleConnectionTest(request),
  "POST /admin/settings/password": (request) => handlePasswordChange(request),
});
