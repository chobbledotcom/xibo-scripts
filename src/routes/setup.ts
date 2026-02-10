/**
 * Setup routes - initial system configuration
 */

import { settingsApi } from "#lib/db/settings.ts";
import { validateForm } from "#lib/forms.tsx";
import { ErrorCode, logDebug, logError } from "#lib/logger.ts";
import { createRouter, defineRoutes } from "#routes/router.ts";
import {
  generateSecureToken,
  htmlResponse,
  htmlResponseWithCookie,
  parseCookies,
  parseFormData,
  redirect,
  validateCsrfToken,
} from "#routes/utils.ts";
import { setupFields, type SetupFormValues } from "#templates/fields.ts";
import { setupCompletePage, setupPage } from "#templates/setup.tsx";

/** Cookie for CSRF token with standard security options */
const setupCsrfCookie = (token: string): string =>
  `setup_csrf=${token}; HttpOnly; Secure; SameSite=Strict; Path=/setup; Max-Age=3600`;

/** Response helper with setup CSRF cookie */
const setupResponse = (token: string) => (error?: string, status = 200) =>
  htmlResponseWithCookie(setupCsrfCookie(token))(
    setupPage(error, token),
    status,
  );

/**
 * Validate setup form data
 */
type SetupValidation =
  | {
    valid: true;
    username: string;
    password: string;
    xiboApiUrl: string;
    xiboClientId: string;
    xiboClientSecret: string;
  }
  | { valid: false; error: string };

const validateSetupForm = (form: URLSearchParams): SetupValidation => {
  logDebug("Setup", "Validating form data...");

  const validation = validateForm<SetupFormValues>(form, setupFields);
  if (!validation.valid) {
    logDebug("Setup", `Form framework validation failed: ${validation.error}`);
    return validation;
  }

  const {
    admin_username: username,
    admin_password: password,
    admin_password_confirm: passwordConfirm,
  } = validation.values;
  const xiboApiUrl = String(validation.values.xibo_api_url || "");
  const xiboClientId = String(validation.values.xibo_client_id || "");
  const xiboClientSecret = String(validation.values.xibo_client_secret || "");

  if (password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters" };
  }
  if (password !== passwordConfirm) {
    return { valid: false, error: "Passwords do not match" };
  }

  return {
    valid: true,
    username,
    password,
    xiboApiUrl,
    xiboClientId,
    xiboClientSecret,
  };
};

/**
 * Handle GET /setup/
 */
const handleSetupGet = async (
  isSetupComplete: () => Promise<boolean>,
): Promise<Response> => {
  if (await isSetupComplete()) {
    return redirect("/");
  }
  const csrfToken = generateSecureToken();
  return setupResponse(csrfToken)();
};

/**
 * Handle POST /setup/
 */
const handleSetupPost = async (
  request: Request,
  isSetupComplete: () => Promise<boolean>,
): Promise<Response> => {
  logDebug("Setup", "POST request received");

  if (await isSetupComplete()) {
    return redirect("/");
  }

  // Validate CSRF token (double-submit cookie pattern)
  const cookies = parseCookies(request);
  const cookieCsrf = cookies.get("setup_csrf") || "";

  const form = await parseFormData(request);
  const formCsrf = form.get("csrf_token") || "";

  if (!cookieCsrf || !formCsrf || !validateCsrfToken(cookieCsrf, formCsrf)) {
    logError({ code: ErrorCode.AUTH_CSRF_MISMATCH, detail: "setup form" });
    const newCsrfToken = generateSecureToken();
    return setupResponse(newCsrfToken)(
      "Invalid or expired form. Please try again.",
      403,
    );
  }

  const validation = validateSetupForm(form);

  if (!validation.valid) {
    logError({ code: ErrorCode.VALIDATION_FORM, detail: "setup" });
    return htmlResponse(setupPage(validation.error, formCsrf), 400);
  }

  logDebug("Setup", "Form validation passed, completing setup...");

  try {
    await settingsApi.completeSetup(
      validation.username,
      validation.password,
      validation.xiboApiUrl,
      validation.xiboClientId,
      validation.xiboClientSecret,
    );
    logDebug("Setup", "Setup completed successfully!");
    return redirect("/setup/complete");
  } catch (error) {
    logError({ code: ErrorCode.DB_QUERY, detail: "setup completion" });
    throw error;
  }
};

/**
 * Handle GET /setup/complete
 */
const handleSetupComplete = async (
  isSetupComplete: () => Promise<boolean>,
): Promise<Response> => {
  if (!(await isSetupComplete())) {
    return redirect("/setup/");
  }
  return htmlResponse(setupCompletePage());
};

/**
 * Create setup router with injected isSetupComplete dependency
 */
export const createSetupRouter = (
  isSetupComplete: () => Promise<boolean>,
): ReturnType<typeof createRouter> => {
  const setupRoutes = defineRoutes({
    "GET /setup/complete": () => handleSetupComplete(isSetupComplete),
    "GET /setup": () => handleSetupGet(isSetupComplete),
    "POST /setup": (request) => handleSetupPost(request, isSetupComplete),
  });

  return createRouter(setupRoutes);
};
