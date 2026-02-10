import { afterEach, beforeEach, describe, expect, test } from "#test-compat";
import { createTestDb, createTestDbWithSetup, resetDb } from "#test-utils";
import { inPlaceholders, queryBatch, queryOne } from "#lib/db/client.ts";
import { initDb } from "#lib/db/migrations/index.ts";
import { getAllActivityLog, logActivity } from "#lib/db/activityLog.ts";
import {
  createSession,
  deleteAllSessions,
  deleteOtherSessions,
  deleteSession,
  getAllSessions,
  getSession,
  resetSessionCache,
} from "#lib/db/sessions.ts";
import {
  decryptAdminLevel,
  decryptUsername,
  deleteUser,
  getUserById,
  getUserByUsername,
  isUsernameTaken,
  verifyUserPassword,
} from "#lib/db/users.ts";
import {
  clearSetupCompleteCache,
  completeSetup,
  getSetting,
  getXiboApiUrl,
  getXiboClientId,
  getXiboClientSecret,
  invalidateSettingsCache,
  isSetupComplete,
  setSetting,
  updateXiboCredentials,
  updateUserPassword,
} from "#lib/db/settings.ts";

describe("database layer", () => {
  afterEach(() => {
    resetDb();
  });

  describe("client.ts", () => {
    beforeEach(async () => {
      await createTestDb();
    });

    test("queryOne returns null when no rows match", async () => {
      const result = await queryOne<{ key: string }>(
        "SELECT key FROM settings WHERE key = ?",
        ["nonexistent_key"],
      );
      expect(result).toBeNull();
    });

    test("queryBatch executes multiple statements", async () => {
      await setSetting("batch_test_1", "value1");
      await setSetting("batch_test_2", "value2");
      invalidateSettingsCache();

      const results = await queryBatch([
        {
          sql: "SELECT value FROM settings WHERE key = ?",
          args: ["batch_test_1"],
        },
        {
          sql: "SELECT value FROM settings WHERE key = ?",
          args: ["batch_test_2"],
        },
      ]);
      expect(results).toHaveLength(2);
      expect(results[0]!.rows[0]?.value).toBe("value1");
      expect(results[1]!.rows[0]?.value).toBe("value2");
    });

    test("inPlaceholders builds correct SQL fragment", () => {
      expect(inPlaceholders([1, 2, 3])).toBe("?, ?, ?");
      expect(inPlaceholders([1])).toBe("?");
      expect(inPlaceholders([])).toBe("");
    });
  });

  describe("migrations", () => {
    test("initDb creates all tables", async () => {
      await createTestDb();
      // If we got here without error, tables were created
      const setting = await getSetting("latest_db_update");
      expect(setting).not.toBeNull();
    });

    test("initDb is idempotent", async () => {
      await createTestDb();
      // Running initDb again should not throw
      await initDb();
      const setting = await getSetting("latest_db_update");
      expect(setting).not.toBeNull();
    });
  });

  describe("activity log", () => {
    beforeEach(async () => {
      await createTestDb();
    });

    test("logActivity inserts with ISO timestamp", async () => {
      await logActivity("Test event occurred");
      const entries = await getAllActivityLog();
      expect(entries).toHaveLength(1);
      expect(entries[0]!.message).toBe("Test event occurred");
      // ISO timestamp check - should contain T separator
      expect(entries[0]!.created).toContain("T");
    });

    test("getAllActivityLog returns entries in reverse chronological order", async () => {
      await logActivity("First event");
      await logActivity("Second event");
      await logActivity("Third event");
      const entries = await getAllActivityLog();
      expect(entries[0]!.message).toBe("Third event");
      expect(entries[2]!.message).toBe("First event");
    });

    test("getAllActivityLog respects limit parameter", async () => {
      await logActivity("One");
      await logActivity("Two");
      await logActivity("Three");
      const entries = await getAllActivityLog(2);
      expect(entries).toHaveLength(2);
    });
  });

  describe("sessions", () => {
    beforeEach(async () => {
      await createTestDb();
    });

    test("createSession stores and caches session", async () => {
      const expires = Date.now() + 86400000;
      await createSession("token-abc", "csrf-123", expires, null, 1);
      const session = await getSession("token-abc");
      expect(session).not.toBeNull();
      expect(session!.csrf_token).toBe("csrf-123");
      expect(session!.user_id).toBe(1);
    });

    test("getSession returns cached session on second call", async () => {
      await createSession("token-cache", "csrf-x", Date.now() + 86400000, null, 1);
      const first = await getSession("token-cache");
      const second = await getSession("token-cache");
      // Both should return the same data
      expect(first!.csrf_token).toBe(second!.csrf_token);
    });

    test("getSession returns null for unknown token", async () => {
      const session = await getSession("nonexistent-token");
      expect(session).toBeNull();
    });

    test("deleteSession removes from DB and cache", async () => {
      await createSession("token-del", "csrf-d", Date.now() + 86400000, null, 1);
      await deleteSession("token-del");
      const session = await getSession("token-del");
      expect(session).toBeNull();
    });

    test("deleteAllSessions clears all sessions", async () => {
      await createSession("t1", "c1", Date.now() + 86400000, null, 1);
      await createSession("t2", "c2", Date.now() + 86400000, null, 1);
      await deleteAllSessions();
      const all = await getAllSessions();
      expect(all).toHaveLength(0);
    });

    test("deleteOtherSessions keeps only the given token", async () => {
      await createSession("keep", "ck", Date.now() + 86400000, null, 1);
      await createSession("remove1", "c1", Date.now() + 86400000, null, 1);
      await createSession("remove2", "c2", Date.now() + 86400000, null, 1);
      await deleteOtherSessions("keep");
      const all = await getAllSessions();
      expect(all).toHaveLength(1);
    });

    test("getAllSessions returns all sessions most-recent-first", async () => {
      const now = Date.now();
      await createSession("old", "c1", now + 1000, null, 1);
      await createSession("new", "c2", now + 99000, null, 1);
      const all = await getAllSessions();
      expect(all).toHaveLength(2);
      // Newest first (higher expiry)
      expect(all[0]!.expires).toBeGreaterThan(all[1]!.expires);
    });

    test("resetSessionCache clears the cache", async () => {
      await createSession("cached-tok", "csrf-c", Date.now() + 86400000, null, 1);
      await getSession("cached-tok"); // populate cache
      resetSessionCache();
      // Session should still be found via DB query after cache clear
      const session = await getSession("cached-tok");
      expect(session).not.toBeNull();
    });
  });

  describe("users", () => {
    beforeEach(async () => {
      await createTestDbWithSetup();
    });

    test("getUserByUsername finds user by blind index", async () => {
      const user = await getUserByUsername("testadmin");
      expect(user).not.toBeNull();
      expect(user!.id).toBeDefined();
    });

    test("getUserById finds user by ID", async () => {
      const byName = await getUserByUsername("testadmin");
      const byId = await getUserById(byName!.id);
      expect(byId).not.toBeNull();
      expect(byId!.id).toBe(byName!.id);
    });

    test("isUsernameTaken returns true for existing username", async () => {
      expect(await isUsernameTaken("testadmin")).toBe(true);
    });

    test("isUsernameTaken returns false for new username", async () => {
      expect(await isUsernameTaken("nonexistentuser")).toBe(false);
    });

    test("verifyUserPassword returns hash on success, null on failure", async () => {
      const user = await getUserByUsername("testadmin");
      const hash = await verifyUserPassword(user!, "testpassword123");
      expect(hash).not.toBeNull();
      expect(typeof hash).toBe("string");

      const badHash = await verifyUserPassword(user!, "wrongpassword");
      expect(badHash).toBeNull();
    });

    test("decryptAdminLevel returns role string", async () => {
      const user = await getUserByUsername("testadmin");
      const level = await decryptAdminLevel(user!);
      expect(level).toBe("owner");
    });

    test("decryptUsername returns plaintext username", async () => {
      const user = await getUserByUsername("testadmin");
      const username = await decryptUsername(user!);
      expect(username).toBe("testadmin");
    });

    test("deleteUser removes user and their sessions", async () => {
      const user = await getUserByUsername("testadmin");
      await deleteUser(user!.id);
      const deleted = await getUserById(user!.id);
      expect(deleted).toBeNull();
    });
  });

  describe("settings", () => {
    beforeEach(async () => {
      await createTestDb();
    });

    test("getSetting returns null for missing key", async () => {
      const value = await getSetting("nonexistent_setting");
      expect(value).toBeNull();
    });

    test("setSetting stores and invalidates cache", async () => {
      await setSetting("test_key", "test_value");
      invalidateSettingsCache();
      const value = await getSetting("test_key");
      expect(value).toBe("test_value");
    });

    test("isSetupComplete returns false before setup", async () => {
      clearSetupCompleteCache();
      expect(await isSetupComplete()).toBe(false);
    });

    test("isSetupComplete returns true after completeSetup", async () => {
      clearSetupCompleteCache();
      await completeSetup("admin", "password123", "", "", "");
      clearSetupCompleteCache();
      expect(await isSetupComplete()).toBe(true);
    });

    test("getXiboApiUrl/getXiboClientId/getXiboClientSecret decrypt values", async () => {
      await completeSetup("admin", "password123", "", "", "");
      await updateXiboCredentials(
        "https://xibo.test",
        "client-id-123",
        "client-secret-456",
      );
      invalidateSettingsCache();

      expect(await getXiboApiUrl()).toBe("https://xibo.test");
      expect(await getXiboClientId()).toBe("client-id-123");
      expect(await getXiboClientSecret()).toBe("client-secret-456");
    });

    test("updateXiboCredentials encrypts and stores", async () => {
      await completeSetup("admin", "password123", "", "", "");
      await updateXiboCredentials("https://x.test", "id", "secret");
      invalidateSettingsCache();

      const url = await getXiboApiUrl();
      expect(url).toBe("https://x.test");
    });

    test("updateUserPassword rehashes, re-wraps key, deletes sessions", async () => {
      await completeSetup("admin", "password123", "", "", "");
      const user = await getUserByUsername("admin");
      const oldHash = await verifyUserPassword(user!, "password123");
      expect(oldHash).not.toBeNull();

      // Create a session to prove it gets deleted
      await createSession("pwd-test", "csrf", Date.now() + 86400000, null, user!.id);

      const success = await updateUserPassword(
        user!.id,
        oldHash!,
        user!.wrapped_data_key!,
        "newpassword123",
      );
      expect(success).toBe(true);

      // Old sessions should be gone
      const sessions = await getAllSessions();
      expect(sessions).toHaveLength(0);

      // New password should work
      invalidateSettingsCache();
      const updatedUser = await getUserById(user!.id);
      const newHash = await verifyUserPassword(updatedUser!, "newpassword123");
      expect(newHash).not.toBeNull();
    });
  });
});
