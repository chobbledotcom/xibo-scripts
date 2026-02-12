/**
 * Shared entity helpers for DB modules.
 * Eliminates duplication in encrypt/decrypt/insert/update patterns.
 */

import type { InValue } from "@libsql/client";
import { decrypt, encrypt } from "#lib/crypto.ts";
import { getDb } from "#lib/db/client.ts";
import { nowIso } from "#lib/now.ts";

// Re-export updateField from client.ts for convenience
export { updateField } from "#lib/db/client.ts";

/**
 * Encrypt name and timestamp for entity creation.
 */
export const prepareEncryptedFields = async (
  name: string,
): Promise<{ encName: string; encCreatedAt: string }> => ({
  encName: await encrypt(name),
  encCreatedAt: await encrypt(nowIso()),
});

/**
 * Insert a row and return the auto-generated ID.
 */
export const insertAndGetId = async (
  sql: string,
  args: InValue[],
): Promise<number> => {
  const result = await getDb().execute({ sql, args });
  return Number(result.lastInsertRowid);
};

/**
 * Decrypt the name and created_at fields common to all display entities.
 */
export const decryptEntity = async <T extends { name: string; created_at: string }>(
  entity: T,
): Promise<T> => ({
  ...entity,
  name: await decrypt(entity.name),
  created_at: await decrypt(entity.created_at),
});

/**
 * Execute a two-parameter SQL statement (curried).
 * Used for association table operations (assign/remove).
 */
export const executePairSql =
  (sql: string) =>
  async (param1: number, param2: number): Promise<void> => {
    await getDb().execute({ sql, args: [param1, param2] });
  };

