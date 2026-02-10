/**
 * Configuration module for Xibo CMS management system
 * Reads configuration from database (set during setup phase)
 * Xibo API credentials are configured via admin settings (stored encrypted in DB)
 */

import { isSetupComplete } from "#lib/db/settings.ts";
import { getEnv } from "#lib/env.ts";

/**
 * Get allowed domain for security validation (runtime config via Bunny secrets)
 * This is a required configuration that hardens origin validation
 */
export const getAllowedDomain = (): string => {
  return getEnv("ALLOWED_DOMAIN") as string;
};

/**
 * Check if initial setup has been completed
 */
export { isSetupComplete };
