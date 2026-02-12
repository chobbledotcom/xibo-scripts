/**
 * Settings table operations
 */

import { lazyRef } from "#fp";
import {
  decrypt,
  encrypt,
  hashPassword,
} from "#lib/crypto.ts";
import { getDb } from "#lib/db/client.ts";
import { nowMs } from "#lib/now.ts";
import { deleteAllSessions } from "#lib/db/sessions.ts";
import { createUser } from "#lib/db/users.ts";
import type { Settings } from "#lib/types.ts";

/**
 * Setting keys for configuration
 */
export const CONFIG_KEYS = {
  SETUP_COMPLETE: "setup_complete",
  // Xibo API configuration (encrypted)
  XIBO_API_URL: "xibo_api_url",
  XIBO_CLIENT_ID: "xibo_client_id",
  XIBO_CLIENT_SECRET: "xibo_client_secret",
  // Shared photo repository folder
  SHARED_FOLDER_ID: "shared_folder_id",
} as const;

/**
 * In-memory settings cache. Loads all rows in a single query and
 * serves subsequent reads from memory until the TTL expires or a
 * write invalidates the cache.
 */
export const SETTINGS_CACHE_TTL_MS = 5_000;

type SettingsCacheState = {
  entries: Map<string, string> | null;
  time: number;
};

const [getSettingsCacheState, setSettingsCacheState] = lazyRef<
  SettingsCacheState
>(
  () => ({ entries: null, time: 0 }),
);

const isCacheValid = (): boolean => {
  const state = getSettingsCacheState();
  return state.entries !== null && nowMs() - state.time < SETTINGS_CACHE_TTL_MS;
};

/**
 * Load every setting row into the in-memory cache with a single query.
 */
export const loadAllSettings = async (): Promise<Map<string, string>> => {
  const result = await getDb().execute("SELECT key, value FROM settings");
  const cache = new Map<string, string>();
  for (const row of result.rows) {
    const { key, value } = row as unknown as Settings;
    cache.set(key, value);
  }
  setSettingsCacheState({ entries: cache, time: nowMs() });
  return cache;
};

/**
 * Invalidate the settings cache (for testing or after writes).
 */
export const invalidateSettingsCache = (): void => {
  setSettingsCacheState(null);
};

/**
 * Get a setting value. Reads from the in-memory cache, loading all
 * settings in one query on first access or after TTL expiry.
 */
export const getSetting = async (key: string): Promise<string | null> => {
  const cache = isCacheValid()
    ? getSettingsCacheState().entries!
    : await loadAllSettings();
  return cache.get(key) ?? null;
};

/**
 * Set a setting value. Invalidates the cache so the next read
 * will pick up the new value.
 */
export const setSetting = async (key: string, value: string): Promise<void> => {
  await getDb().execute({
    sql: "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    args: [key, value],
  });
  invalidateSettingsCache();
};

/**
 * Cached setup complete status using lazyRef pattern.
 * Once setup is complete (true), it can never go back to false,
 * so we cache it permanently to avoid per-request DB queries.
 */
const [getSetupCompleteCache, setSetupCompleteCache] = lazyRef<boolean>(
  () => false,
);

/**
 * Track whether we've confirmed setup is complete
 */
const [getSetupConfirmed, setSetupConfirmed] = lazyRef<boolean>(() => false);

/**
 * Check if initial setup has been completed
 * Result is cached in memory - once true, we never query again.
 */
export const isSetupComplete = async (): Promise<boolean> => {
  // Check both caches (avoid short-circuit to ensure consistent initialization)
  const confirmed = getSetupConfirmed();
  const cached = getSetupCompleteCache();
  if (confirmed && cached) return true;

  const value = await getSetting(CONFIG_KEYS.SETUP_COMPLETE);
  const isComplete = value === "true";

  // Only cache positive result (setup complete is permanent)
  if (isComplete) {
    setSetupCompleteCache(true);
    setSetupConfirmed(true);
  }

  return isComplete;
};

/**
 * Clear setup complete cache (for testing)
 */
export const clearSetupCompleteCache = (): void => {
  setSetupCompleteCache(null);
  setSetupConfirmed(null);
};

/**
 * Complete initial setup by storing all configuration.
 * Creates the first owner user row and stores Xibo API credentials encrypted.
 */
export const completeSetup = async (
  username: string,
  adminPassword: string,
  xiboApiUrl: string,
  xiboClientId: string,
  xiboClientSecret: string,
): Promise<void> => {
  const hashedPassword = await hashPassword(adminPassword);

  await createUser(username, hashedPassword, "owner");

  // Store Xibo API credentials (encrypted at rest)
  if (xiboApiUrl) {
    await setSetting(CONFIG_KEYS.XIBO_API_URL, await encrypt(xiboApiUrl));
  }
  if (xiboClientId) {
    await setSetting(CONFIG_KEYS.XIBO_CLIENT_ID, await encrypt(xiboClientId));
  }
  if (xiboClientSecret) {
    await setSetting(
      CONFIG_KEYS.XIBO_CLIENT_SECRET,
      await encrypt(xiboClientSecret),
    );
  }

  await setSetting(CONFIG_KEYS.SETUP_COMPLETE, "true");
};

/**
 * Get Xibo API URL from database (decrypted)
 * Returns null if not configured
 */
export const getXiboApiUrl = async (): Promise<string | null> => {
  const value = await getSetting(CONFIG_KEYS.XIBO_API_URL);
  if (!value) return null;
  return decrypt(value);
};

/**
 * Get Xibo Client ID from database (decrypted)
 * Returns null if not configured
 */
export const getXiboClientId = async (): Promise<string | null> => {
  const value = await getSetting(CONFIG_KEYS.XIBO_CLIENT_ID);
  if (!value) return null;
  return decrypt(value);
};

/**
 * Get Xibo Client Secret from database (decrypted)
 * Returns null if not configured
 */
export const getXiboClientSecret = async (): Promise<string | null> => {
  const value = await getSetting(CONFIG_KEYS.XIBO_CLIENT_SECRET);
  if (!value) return null;
  return decrypt(value);
};

/**
 * Update Xibo API credentials (encrypted at rest)
 */
export const updateXiboCredentials = async (
  apiUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<void> => {
  await setSetting(CONFIG_KEYS.XIBO_API_URL, await encrypt(apiUrl));
  await setSetting(CONFIG_KEYS.XIBO_CLIENT_ID, await encrypt(clientId));
  await setSetting(CONFIG_KEYS.XIBO_CLIENT_SECRET, await encrypt(clientSecret));
};

/**
 * Update a user's password
 */
export const updateUserPassword = async (
  userId: number,
  newPassword: string,
): Promise<void> => {
  const newHash = await hashPassword(newPassword);
  const encryptedNewHash = await encrypt(newHash);

  await getDb().execute({
    sql: "UPDATE users SET password_hash = ? WHERE id = ?",
    args: [encryptedNewHash, userId],
  });

  // Invalidate all sessions (force re-login with new password)
  await deleteAllSessions();
};

/**
 * Get the shared folder ID for the shared photo repository.
 * Returns the numeric folder ID or null if not configured.
 */
export const getSharedFolderId = async (): Promise<number | null> => {
  const value = await getSetting(CONFIG_KEYS.SHARED_FOLDER_ID);
  if (!value) return null;
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
};

/**
 * Set the shared folder ID for the shared photo repository.
 */
export const setSharedFolderId = async (folderId: number): Promise<void> => {
  await setSetting(CONFIG_KEYS.SHARED_FOLDER_ID, String(folderId));
};

/**
 * Stubbable API for testing
 */
export const settingsApi = {
  completeSetup,
  getSetting,
  setSetting,
  loadAllSettings,
  invalidateSettingsCache,
  isSetupComplete,
  clearSetupCompleteCache,
  updateUserPassword,
  getXiboApiUrl,
  getXiboClientId,
  getXiboClientSecret,
  updateXiboCredentials,
  getSharedFolderId,
  setSharedFolderId,
};
