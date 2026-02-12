/**
 * Screens table operations
 */

import { executeByField, getDb, queryAll, queryOne } from "#lib/db/client.ts";
import {
  decryptEntity,
  insertAndGetId,
  prepareEncryptedFields,
} from "#lib/db/entity-helpers.ts";
import type { Screen } from "#lib/types.ts";

/**
 * Create a new screen with encrypted fields
 */
export const createScreen = async (
  name: string,
  businessId: number,
  xiboDisplayId: number | null,
): Promise<Screen> => {
  const { encName, encCreatedAt } = await prepareEncryptedFields(name);
  const id = await insertAndGetId(
    "INSERT INTO screens (name, business_id, xibo_display_id, created_at) VALUES (?, ?, ?, ?)",
    [encName, businessId, xiboDisplayId, encCreatedAt],
  );

  return {
    id,
    name: encName,
    business_id: businessId,
    xibo_display_id: xiboDisplayId,
    created_at: encCreatedAt,
  };
};

/**
 * Get a screen by ID
 */
export const getScreenById = (id: number): Promise<Screen | null> =>
  queryOne<Screen>(
    "SELECT id, name, business_id, xibo_display_id, created_at FROM screens WHERE id = ?",
    [id],
  );

/**
 * Get all screens for a business
 */
export const getScreensForBusiness = (
  businessId: number,
): Promise<Screen[]> =>
  queryAll<Screen>(
    "SELECT id, name, business_id, xibo_display_id, created_at FROM screens WHERE business_id = ? ORDER BY id ASC",
    [businessId],
  );

/**
 * Delete a screen and cascade delete its menu_screens
 */
export const deleteScreen = async (id: number): Promise<void> => {
  await executeByField("menu_screens", "screen_id", id);
  await executeByField("screens", "id", id);
};

/**
 * Get all xibo_display_ids that are already assigned to screens
 */
export const getAssignedDisplayIds = async (): Promise<number[]> => {
  const result = await getDb().execute(
    "SELECT xibo_display_id FROM screens WHERE xibo_display_id IS NOT NULL",
  );
  return result.rows.map((r) => r.xibo_display_id as number);
};

/**
 * Decrypt a screen for display
 */
export const toDisplayScreen = (
  screen: Screen,
): Promise<Screen> => decryptEntity(screen);
