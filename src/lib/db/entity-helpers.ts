/**
 * Shared entity creation helpers for DB modules.
 * Eliminates duplication in encrypt-and-insert patterns.
 */

import type { InValue } from "@libsql/client";
import { encrypt } from "#lib/crypto.ts";
import { getDb } from "#lib/db/client.ts";
import { nowIso } from "#lib/now.ts";

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
 * Execute a two-parameter SQL statement (curried).
 * Used for association table operations (assign/remove).
 */
export const executePairSql =
  (sql: string) =>
  async (param1: number, param2: number): Promise<void> => {
    await getDb().execute({ sql, args: [param1, param2] });
  };
