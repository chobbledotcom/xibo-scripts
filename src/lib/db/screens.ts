/**
 * Screens table operations
 */

import { decrypt } from "#lib/crypto.ts";
import { getDb, queryOne } from "#lib/db/client.ts";
import { insertAndGetId, prepareEncryptedFields } from "#lib/db/entity-helpers.ts";
import type { Screen } from "#lib/types.ts";

/** Decrypted screen for display */
export interface DisplayScreen {
  id: number;
  name: string;
  business_id: number;
  xibo_display_id: number | null;
  created_at: string;
}

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
export const getScreensForBusiness = async (
  businessId: number,
): Promise<Screen[]> => {
  const result = await getDb().execute({
    sql: "SELECT id, name, business_id, xibo_display_id, created_at FROM screens WHERE business_id = ? ORDER BY id ASC",
    args: [businessId],
  });
  return result.rows as unknown as Screen[];
};

/**
 * Delete a screen and cascade delete its menu_screens
 */
export const deleteScreen = async (id: number): Promise<void> => {
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM menu_screens WHERE screen_id = ?",
    args: [id],
  });
  await db.execute({
    sql: "DELETE FROM screens WHERE id = ?",
    args: [id],
  });
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
export const toDisplayScreen = async (
  screen: Screen,
): Promise<DisplayScreen> => ({
  id: screen.id,
  name: await decrypt(screen.name),
  business_id: screen.business_id,
  xibo_display_id: screen.xibo_display_id,
  created_at: await decrypt(screen.created_at),
});
