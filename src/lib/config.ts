/**
 * Configuration module for Xibo CMS management system
 * Reads configuration from database (set during setup phase)
 * Xibo API credentials are configured via admin settings (stored encrypted in DB)
 */

import { isSetupComplete } from "#lib/db/settings.ts";
import { getEnv } from "#lib/env.ts";
import { ErrorCode, logError } from "#lib/logger.ts";

/**
 * Get allowed domain for security validation (runtime config via Bunny secrets)
 * This is a required configuration that hardens origin validation.
 * Throws if ALLOWED_DOMAIN is not set — the app cannot run securely without it.
 */
export const getAllowedDomain = (): string => {
  const domain = getEnv("ALLOWED_DOMAIN");
  if (!domain) {
    logError({ code: ErrorCode.CONFIG_MISSING, detail: "ALLOWED_DOMAIN" });
    throw new Error("ALLOWED_DOMAIN environment variable is required");
  }
  return domain;
};

/**
 * Check if initial setup has been completed
 */
export { isSetupComplete };
