/**
 * Crypto-related test helpers (no database dependency)
 */

import { clearEncryptionKeyCache } from "#lib/crypto.ts";

/**
 * Test encryption key (32 bytes base64-encoded)
 */
export const TEST_ENCRYPTION_KEY =
  "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

/**
 * Set up test encryption key in environment
 */
export const setupTestEncryptionKey = (): void => {
  Deno.env.set("DB_ENCRYPTION_KEY", TEST_ENCRYPTION_KEY);
  Deno.env.set("TEST_PBKDF2_ITERATIONS", "1");
  Deno.env.set("TEST_SKIP_LOGIN_DELAY", "1");
  clearEncryptionKeyCache();
};

/**
 * Clear test encryption key from environment
 */
export const clearTestEncryptionKey = (): void => {
  Deno.env.delete("DB_ENCRYPTION_KEY");
  Deno.env.delete("TEST_PBKDF2_ITERATIONS");
  Deno.env.delete("TEST_SKIP_LOGIN_DELAY");
  clearEncryptionKeyCache();
};
