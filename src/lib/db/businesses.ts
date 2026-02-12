/**
 * Businesses table operations
 */

import { decrypt, encrypt } from "#lib/crypto.ts";
import { getDb, queryAll, queryOne } from "#lib/db/client.ts";
import {
  decryptEntity,
  executePairSql,
  insertAndGetId,
  prepareEncryptedFields,
} from "#lib/db/entity-helpers.ts";
import type { Business } from "#lib/types.ts";

/** Decrypted business for display */
export interface DisplayBusiness {
  id: number;
  name: string;
  xibo_folder_id: number | null;
  folder_name: string | null;
  xibo_dataset_id: number | null;
  created_at: string;
}

/**
 * Create a new business with encrypted fields
 */
export const createBusiness = async (
  name: string,
): Promise<Business> => {
  const { encName, encCreatedAt } = await prepareEncryptedFields(name);
  const id = await insertAndGetId(
    "INSERT INTO businesses (name, created_at) VALUES (?, ?)",
    [encName, encCreatedAt],
  );

  return {
    id,
    name: encName,
    xibo_folder_id: null,
    folder_name: null,
    xibo_dataset_id: null,
    created_at: encCreatedAt,
  };
};

/**
 * Get a business by ID
 */
export const getBusinessById = (id: number): Promise<Business | null> =>
  queryOne<Business>(
    "SELECT id, name, xibo_folder_id, folder_name, xibo_dataset_id, created_at FROM businesses WHERE id = ?",
    [id],
  );

/**
 * Get all businesses
 */
export const getAllBusinesses = (): Promise<Business[]> =>
  queryAll<Business>(
    "SELECT id, name, xibo_folder_id, folder_name, xibo_dataset_id, created_at FROM businesses ORDER BY id ASC",
  );

/**
 * Get businesses for a given user (via business_users mapping)
 */
export const getBusinessesForUser = (
  userId: number,
): Promise<Business[]> =>
  queryAll<Business>(
    `SELECT b.id, b.name, b.xibo_folder_id, b.folder_name, b.xibo_dataset_id, b.created_at
          FROM businesses b
          INNER JOIN business_users bu ON b.id = bu.business_id
          WHERE bu.user_id = ?
          ORDER BY b.id ASC`,
    [userId],
  );

/**
 * Update a business name
 */
export const updateBusiness = async (
  id: number,
  name: string,
): Promise<void> => {
  const encryptedName = await encrypt(name);
  await getDb().execute({
    sql: "UPDATE businesses SET name = ? WHERE id = ?",
    args: [encryptedName, id],
  });
};

/**
 * Update Xibo folder and dataset IDs on a business
 */
export const updateBusinessXiboIds = async (
  id: number,
  xiboFolderId: number,
  folderName: string,
  xiboDatasetId: number,
): Promise<void> => {
  const encryptedFolderName = await encrypt(folderName);
  await getDb().execute({
    sql: "UPDATE businesses SET xibo_folder_id = ?, folder_name = ?, xibo_dataset_id = ? WHERE id = ?",
    args: [xiboFolderId, encryptedFolderName, xiboDatasetId, id],
  });
};

/**
 * Delete a business and cascade delete its screens and menu_screens
 */
export const deleteBusiness = async (id: number): Promise<void> => {
  const db = getDb();
  // Delete menu_screens for all screens of this business
  await db.execute({
    sql: "DELETE FROM menu_screens WHERE screen_id IN (SELECT id FROM screens WHERE business_id = ?)",
    args: [id],
  });
  // Delete screens
  await db.execute({
    sql: "DELETE FROM screens WHERE business_id = ?",
    args: [id],
  });
  // Delete business_users mappings
  await db.execute({
    sql: "DELETE FROM business_users WHERE business_id = ?",
    args: [id],
  });
  // Delete business
  await db.execute({
    sql: "DELETE FROM businesses WHERE id = ?",
    args: [id],
  });
};

/** Assign a user to a business */
export const assignUserToBusiness = executePairSql(
  "INSERT OR IGNORE INTO business_users (business_id, user_id) VALUES (?, ?)",
);

/** Remove a user from a business */
export const removeUserFromBusiness = executePairSql(
  "DELETE FROM business_users WHERE business_id = ? AND user_id = ?",
);

/**
 * Get user IDs assigned to a business
 */
export const getBusinessUserIds = async (
  businessId: number,
): Promise<number[]> => {
  const result = await getDb().execute({
    sql: "SELECT user_id FROM business_users WHERE business_id = ? ORDER BY user_id ASC",
    args: [businessId],
  });
  return result.rows.map((r) => r.user_id as number);
};

/**
 * Decrypt a business for display
 */
export const toDisplayBusiness = async (
  business: Business,
): Promise<DisplayBusiness> => ({
  ...(await decryptEntity(business)),
  folder_name: business.folder_name
    ? await decrypt(business.folder_name)
    : null,
});
