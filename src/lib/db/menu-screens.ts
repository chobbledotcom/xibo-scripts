/**
 * Menu screens table operations
 *
 * Menu screens represent user-configured display layouts for a screen.
 * Each menu screen maps to a Xibo layout and contains selected products.
 */

import { executeByField, getDb, queryAll, queryOne } from "#lib/db/client.ts";
import {
  decryptEntity,
  insertAndGetId,
  prepareEncryptedFields,
  updateField,
} from "#lib/db/entity-helpers.ts";
import type { MenuScreen, MenuScreenItem } from "#lib/types.ts";

/**
 * Decrypted menu screen for display.
 * Structurally identical to MenuScreen — the alias documents that
 * `name` and `created_at` have been decrypted for safe rendering.
 */
export type DisplayMenuScreen = MenuScreen;

/** Fields selected in all menu_screens queries */
const MENU_SCREEN_COLS =
  "id, name, screen_id, template_id, display_time, sort_order, xibo_layout_id, xibo_campaign_id, created_at";

/**
 * Create a new menu screen with encrypted fields
 */
export const createMenuScreen = async (
  name: string,
  screenId: number,
  templateId: string,
  displayTime: number,
  sortOrder: number,
): Promise<MenuScreen> => {
  const { encName, encCreatedAt } = await prepareEncryptedFields(name);
  const id = await insertAndGetId(
    "INSERT INTO menu_screens (name, screen_id, template_id, display_time, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [encName, screenId, templateId, displayTime, sortOrder, encCreatedAt],
  );

  return {
    id,
    name: encName,
    screen_id: screenId,
    template_id: templateId,
    display_time: displayTime,
    sort_order: sortOrder,
    xibo_layout_id: null,
    xibo_campaign_id: null,
    created_at: encCreatedAt,
  };
};

/**
 * Get a menu screen by ID
 */
export const getMenuScreenById = (id: number): Promise<MenuScreen | null> =>
  queryOne<MenuScreen>(
    `SELECT ${MENU_SCREEN_COLS} FROM menu_screens WHERE id = ?`,
    [id],
  );

/**
 * Get all menu screens for a screen, ordered by sort_order
 */
export const getMenuScreensForScreen = (
  screenId: number,
): Promise<MenuScreen[]> =>
  queryAll<MenuScreen>(
    `SELECT ${MENU_SCREEN_COLS} FROM menu_screens WHERE screen_id = ? ORDER BY sort_order ASC, id ASC`,
    [screenId],
  );

/**
 * Update a menu screen's editable fields
 */
export const updateMenuScreen = async (
  id: number,
  name: string,
  templateId: string,
  displayTime: number,
  sortOrder: number,
): Promise<void> => {
  const { encName } = await prepareEncryptedFields(name);
  await getDb().execute({
    sql: "UPDATE menu_screens SET name = ?, template_id = ?, display_time = ?, sort_order = ? WHERE id = ?",
    args: [encName, templateId, displayTime, sortOrder, id],
  });
};

/**
 * Update the Xibo layout ID for a menu screen
 */
export const updateMenuScreenLayoutId = (
  id: number,
  xiboLayoutId: number,
): Promise<void> => updateField("menu_screens", id, "xibo_layout_id", xiboLayoutId);

/**
 * Update the Xibo campaign ID for a menu screen
 */
export const updateMenuScreenCampaignId = (
  id: number,
  xiboCampaignId: number | null,
): Promise<void> => updateField("menu_screens", id, "xibo_campaign_id", xiboCampaignId);

/**
 * Delete a menu screen and its items
 */
export const deleteMenuScreen = async (id: number): Promise<void> => {
  await executeByField("menu_screen_items", "menu_screen_id", id);
  await executeByField("menu_screens", "id", id);
};

// ─── Menu Screen Items ──────────────────────────────────────────────

/**
 * Get all items for a menu screen, ordered by sort_order
 */
export const getMenuScreenItems = (
  menuScreenId: number,
): Promise<MenuScreenItem[]> =>
  queryAll<MenuScreenItem>(
    "SELECT id, menu_screen_id, product_row_id, sort_order FROM menu_screen_items WHERE menu_screen_id = ? ORDER BY sort_order ASC",
    [menuScreenId],
  );

/**
 * Replace all items for a menu screen (delete + insert).
 * Each product is a dataset row ID with a sort order.
 */
export const setMenuScreenItems = async (
  menuScreenId: number,
  productRowIds: number[],
): Promise<void> => {
  await executeByField("menu_screen_items", "menu_screen_id", menuScreenId);
  const db = getDb();
  for (let i = 0; i < productRowIds.length; i++) {
    const rowId = productRowIds[i]!;
    await db.execute({
      sql: "INSERT INTO menu_screen_items (menu_screen_id, product_row_id, sort_order) VALUES (?, ?, ?)",
      args: [menuScreenId, rowId, i],
    });
  }
};

/**
 * Decrypt a menu screen for display
 */
export const toDisplayMenuScreen = (
  ms: MenuScreen,
): Promise<DisplayMenuScreen> => decryptEntity(ms);
