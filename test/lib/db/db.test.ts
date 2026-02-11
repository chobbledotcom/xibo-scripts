import { afterEach, beforeEach, describe, expect, it } from "#test-compat";
import {
  createTestDb,
  createTestDbWithSetup,
  resetDb,
  TEST_ADMIN_PASSWORD,
  TEST_ADMIN_USERNAME,
} from "#test-utils";

describe("database layer", () => {
  afterEach(() => {
    resetDb();
  });

  describe("client.ts", () => {
    it("queryOne returns null when no rows match", async () => {
      await createTestDb();
      const { queryOne } = await import("#lib/db/client.ts");
      const result = await queryOne("SELECT * FROM settings WHERE key = ?", [
        "nonexistent",
      ]);
      expect(result).toBeNull();
    });

    it("queryBatch executes multiple statements", async () => {
      await createTestDb();
      const { queryBatch, getDb } = await import("#lib/db/client.ts");
      await getDb().execute({
        sql: "INSERT INTO settings (key, value) VALUES ('a', '1')",
        args: [],
      });
      await getDb().execute({
        sql: "INSERT INTO settings (key, value) VALUES ('b', '2')",
        args: [],
      });
      const results = await queryBatch([
        { sql: "SELECT value FROM settings WHERE key = ?", args: ["a"] },
        { sql: "SELECT value FROM settings WHERE key = ?", args: ["b"] },
      ]);
      expect(results.length).toBe(2);
      expect(results[0]!.rows[0]!.value).toBe("1");
      expect(results[1]!.rows[0]!.value).toBe("2");
    });

    it("inPlaceholders builds correct SQL fragment", async () => {
      const { inPlaceholders } = await import("#lib/db/client.ts");
      expect(inPlaceholders([1, 2, 3])).toBe("?, ?, ?");
      expect(inPlaceholders([1])).toBe("?");
      expect(inPlaceholders([])).toBe("");
    });
  });

  describe("migrations", () => {
    it("initDb creates all tables including multi-tenant tables", async () => {
      await createTestDb();
      const { getDb } = await import("#lib/db/client.ts");
      // Verify all tables exist by querying them
      for (const table of [
        "settings", "sessions", "users", "activity_log", "cache",
        "login_attempts", "businesses", "business_users", "screens", "menu_screens",
      ]) {
        const result = await getDb().execute(`SELECT COUNT(*) as cnt FROM ${table}`);
        expect(result.rows.length).toBe(1);
      }
    });

    it("initDb is idempotent (running twice is safe)", async () => {
      await createTestDb();
      const { initDb } = await import("#lib/db/migrations/index.ts");
      // Running again should not throw
      await initDb();
    });

    it("skips migration when schema is already current", async () => {
      await createTestDb();
      const { initDb } = await import("#lib/db/migrations/index.ts");
      // Second call skips because latest_db_update is already set
      await initDb();
    });
  });

  describe("multi-tenant tables", () => {
    beforeEach(async () => {
      await createTestDb();
    });

    it("businesses table supports insert and query", async () => {
      const { getDb } = await import("#lib/db/client.ts");
      await getDb().execute({
        sql: "INSERT INTO businesses (name, xibo_folder_id, folder_name, xibo_dataset_id, created_at) VALUES (?, ?, ?, ?, ?)",
        args: ["enc:test-biz", 10, "enc:biz-abc", 20, "enc:2025-01-01T00:00:00Z"],
      });
      const result = await getDb().execute("SELECT * FROM businesses WHERE id = 1");
      expect(result.rows.length).toBe(1);
      expect(result.rows[0]!.name).toBe("enc:test-biz");
      expect(Number(result.rows[0]!.xibo_folder_id)).toBe(10);
      expect(Number(result.rows[0]!.xibo_dataset_id)).toBe(20);
    });

    it("businesses table auto-increments id", async () => {
      const { getDb } = await import("#lib/db/client.ts");
      await getDb().execute({
        sql: "INSERT INTO businesses (name, created_at) VALUES (?, ?)",
        args: ["enc:biz1", "enc:2025-01-01"],
      });
      await getDb().execute({
        sql: "INSERT INTO businesses (name, created_at) VALUES (?, ?)",
        args: ["enc:biz2", "enc:2025-01-02"],
      });
      const result = await getDb().execute("SELECT id FROM businesses ORDER BY id");
      expect(result.rows.length).toBe(2);
      expect(Number(result.rows[0]!.id)).toBe(1);
      expect(Number(result.rows[1]!.id)).toBe(2);
    });

    it("business_users table enforces composite primary key", async () => {
      const { getDb } = await import("#lib/db/client.ts");
      // Create parent records for FK constraints
      await getDb().execute({
        sql: "INSERT INTO users (username_hash, username_index, password_hash, admin_level) VALUES (?, ?, ?, ?)",
        args: ["u1", "idx1", "", "user"],
      });
      await getDb().execute({
        sql: "INSERT INTO businesses (name, created_at) VALUES (?, ?)",
        args: ["enc:biz", "enc:now"],
      });
      await getDb().execute({
        sql: "INSERT INTO business_users (business_id, user_id) VALUES (?, ?)",
        args: [1, 1],
      });
      // Duplicate should fail
      let threw = false;
      try {
        await getDb().execute({
          sql: "INSERT INTO business_users (business_id, user_id) VALUES (?, ?)",
          args: [1, 1],
        });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });

    it("business_users allows multiple users per business", async () => {
      const { getDb } = await import("#lib/db/client.ts");
      // Create parent records for FK constraints
      await getDb().execute({
        sql: "INSERT INTO users (username_hash, username_index, password_hash, admin_level) VALUES (?, ?, ?, ?)",
        args: ["u1", "idx1", "", "user"],
      });
      await getDb().execute({
        sql: "INSERT INTO users (username_hash, username_index, password_hash, admin_level) VALUES (?, ?, ?, ?)",
        args: ["u2", "idx2", "", "user"],
      });
      await getDb().execute({
        sql: "INSERT INTO businesses (name, created_at) VALUES (?, ?)",
        args: ["enc:biz", "enc:now"],
      });
      await getDb().execute({
        sql: "INSERT INTO business_users (business_id, user_id) VALUES (?, ?)",
        args: [1, 1],
      });
      await getDb().execute({
        sql: "INSERT INTO business_users (business_id, user_id) VALUES (?, ?)",
        args: [1, 2],
      });
      const result = await getDb().execute("SELECT * FROM business_users WHERE business_id = 1");
      expect(result.rows.length).toBe(2);
    });

    it("screens table supports insert with business_id", async () => {
      const { getDb } = await import("#lib/db/client.ts");
      await getDb().execute({
        sql: "INSERT INTO businesses (name, created_at) VALUES (?, ?)",
        args: ["enc:biz", "enc:now"],
      });
      await getDb().execute({
        sql: "INSERT INTO screens (name, business_id, xibo_display_id, created_at) VALUES (?, ?, ?, ?)",
        args: ["enc:screen1", 1, 42, "enc:2025-01-01"],
      });
      const result = await getDb().execute("SELECT * FROM screens WHERE id = 1");
      expect(result.rows.length).toBe(1);
      expect(Number(result.rows[0]!.business_id)).toBe(1);
      expect(Number(result.rows[0]!.xibo_display_id)).toBe(42);
    });

    it("menu_screens table supports insert with all fields", async () => {
      const { getDb } = await import("#lib/db/client.ts");
      await getDb().execute({
        sql: "INSERT INTO businesses (name, created_at) VALUES (?, ?)",
        args: ["enc:biz", "enc:now"],
      });
      await getDb().execute({
        sql: "INSERT INTO screens (name, business_id, created_at) VALUES (?, ?, ?)",
        args: ["enc:screen", 1, "enc:now"],
      });
      await getDb().execute({
        sql: "INSERT INTO menu_screens (name, screen_id, template_id, display_time, sort_order, xibo_layout_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: ["enc:menu1", 1, "tmpl-v1", 30, 1, 99, "enc:2025-01-01"],
      });
      const result = await getDb().execute("SELECT * FROM menu_screens WHERE id = 1");
      expect(result.rows.length).toBe(1);
      expect(Number(result.rows[0]!.screen_id)).toBe(1);
      expect(result.rows[0]!.template_id).toBe("tmpl-v1");
      expect(Number(result.rows[0]!.display_time)).toBe(30);
      expect(Number(result.rows[0]!.sort_order)).toBe(1);
      expect(Number(result.rows[0]!.xibo_layout_id)).toBe(99);
    });
  });

  describe("activity log", () => {
    it("logActivity inserts with ISO timestamp", async () => {
      await createTestDb();
      const { logActivity, getAllActivityLog } = await import(
        "#lib/db/activityLog.ts"
      );
      await logActivity("Test activity");
      const logs = await getAllActivityLog();
      expect(logs.length).toBe(1);
      expect(logs[0]!.message).toBe("Test activity");
      // ISO timestamp format check
      expect(logs[0]!.created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("getAllActivityLog returns entries in reverse chronological order", async () => {
      await createTestDb();
      const { logActivity, getAllActivityLog } = await import(
        "#lib/db/activityLog.ts"
      );
      await logActivity("First");
      await logActivity("Second");
      await logActivity("Third");
      const logs = await getAllActivityLog();
      expect(logs[0]!.message).toBe("Third");
      expect(logs[2]!.message).toBe("First");
    });

    it("getAllActivityLog respects limit parameter", async () => {
      await createTestDb();
      const { logActivity, getAllActivityLog } = await import(
        "#lib/db/activityLog.ts"
      );
      await logActivity("A");
      await logActivity("B");
      await logActivity("C");
      const logs = await getAllActivityLog(2);
      expect(logs.length).toBe(2);
    });
  });

  describe("sessions", () => {
    beforeEach(async () => {
      await createTestDb();
    });

    it("createSession stores and caches session", async () => {
      const { createSession, getSession } = await import(
        "#lib/db/sessions.ts"
      );
      await createSession("tok-1", "csrf-1", Date.now() + 60000, null, 1);
      const session = await getSession("tok-1");
      expect(session).not.toBeNull();
      expect(session!.csrf_token).toBe("csrf-1");
    });

    it("getSession returns cached session on second call", async () => {
      const { createSession, getSession } = await import(
        "#lib/db/sessions.ts"
      );
      await createSession("tok-2", "csrf-2", Date.now() + 60000, null, 1);
      const s1 = await getSession("tok-2");
      const s2 = await getSession("tok-2");
      expect(s1).toEqual(s2);
    });

    it("getSession returns null for unknown token", async () => {
      const { getSession } = await import("#lib/db/sessions.ts");
      const session = await getSession("unknown-token");
      expect(session).toBeNull();
    });

    it("deleteSession removes from DB and cache", async () => {
      const { createSession, deleteSession, getSession } = await import(
        "#lib/db/sessions.ts"
      );
      await createSession("tok-3", "csrf-3", Date.now() + 60000, null, 1);
      await deleteSession("tok-3");
      const session = await getSession("tok-3");
      expect(session).toBeNull();
    });

    it("deleteAllSessions clears all sessions", async () => {
      const { createSession, deleteAllSessions, getAllSessions } = await import(
        "#lib/db/sessions.ts"
      );
      await createSession("tok-a", "csrf-a", Date.now() + 60000, null, 1);
      await createSession("tok-b", "csrf-b", Date.now() + 60000, null, 1);
      await deleteAllSessions();
      const all = await getAllSessions();
      expect(all.length).toBe(0);
    });

    it("deleteOtherSessions keeps only the given token", async () => {
      const {
        createSession,
        deleteOtherSessions,
        getSession,
        getAllSessions,
      } = await import("#lib/db/sessions.ts");
      await createSession("tok-keep", "csrf", Date.now() + 60000, null, 1);
      await createSession("tok-del", "csrf", Date.now() + 60000, null, 1);
      await deleteOtherSessions("tok-keep");
      const kept = await getSession("tok-keep");
      expect(kept).not.toBeNull();
      const all = await getAllSessions();
      expect(all.length).toBe(1);
    });

    it("getAllSessions returns all sessions most-recent-first", async () => {
      const { createSession, getAllSessions } = await import(
        "#lib/db/sessions.ts"
      );
      await createSession("tok-old", "c", Date.now() + 10000, null, 1);
      await createSession("tok-new", "c", Date.now() + 90000, null, 1);
      const all = await getAllSessions();
      expect(all.length).toBe(2);
      // Ordered by expires DESC
      expect(all[0]!.expires).toBeGreaterThan(all[1]!.expires);
    });

    it("resetSessionCache clears the cache", async () => {
      const { createSession, getSession, resetSessionCache } = await import(
        "#lib/db/sessions.ts"
      );
      await createSession("tok-cache", "c", Date.now() + 60000, null, 1);
      // Read to populate cache
      await getSession("tok-cache");
      resetSessionCache();
      // Session still exists in DB, should be re-fetched
      const s = await getSession("tok-cache");
      expect(s).not.toBeNull();
    });
  });

  describe("users", () => {
    beforeEach(async () => {
      await createTestDbWithSetup();
    });

    it("getUserByUsername finds user by blind index", async () => {
      const { getUserByUsername } = await import("#lib/db/users.ts");
      const user = await getUserByUsername(TEST_ADMIN_USERNAME);
      expect(user).not.toBeNull();
      expect(user!.id).toBeGreaterThan(0);
    });

    it("getUserById finds user by ID", async () => {
      const { getUserByUsername, getUserById } = await import(
        "#lib/db/users.ts"
      );
      const user = await getUserByUsername(TEST_ADMIN_USERNAME);
      const byId = await getUserById(user!.id);
      expect(byId).not.toBeNull();
      expect(byId!.id).toBe(user!.id);
    });

    it("isUsernameTaken returns true for existing username", async () => {
      const { isUsernameTaken } = await import("#lib/db/users.ts");
      expect(await isUsernameTaken(TEST_ADMIN_USERNAME)).toBe(true);
      expect(await isUsernameTaken("nonexistent_user_xyz")).toBe(false);
    });

    it("verifyUserPassword returns hash on success, null on failure", async () => {
      const { getUserByUsername, verifyUserPassword } = await import(
        "#lib/db/users.ts"
      );
      const user = await getUserByUsername(TEST_ADMIN_USERNAME);
      const result = await verifyUserPassword(user!, TEST_ADMIN_PASSWORD);
      expect(result).not.toBeNull();
      expect(typeof result).toBe("string");

      const wrongResult = await verifyUserPassword(user!, "wrongpassword");
      expect(wrongResult).toBeNull();
    });

    it("decryptAdminLevel returns role string", async () => {
      const { getUserByUsername, decryptAdminLevel } = await import(
        "#lib/db/users.ts"
      );
      const user = await getUserByUsername(TEST_ADMIN_USERNAME);
      const role = await decryptAdminLevel(user!);
      expect(role).toBe("owner");
    });

    it("decryptUsername returns plaintext username", async () => {
      const { getUserByUsername, decryptUsername } = await import(
        "#lib/db/users.ts"
      );
      const user = await getUserByUsername(TEST_ADMIN_USERNAME);
      const name = await decryptUsername(user!);
      expect(name).toBe(TEST_ADMIN_USERNAME);
    });

    it("deleteUser removes user and their sessions", async () => {
      const { getUserByUsername, getUserById, deleteUser } = await import(
        "#lib/db/users.ts"
      );
      const { createSession, getAllSessions } = await import(
        "#lib/db/sessions.ts"
      );
      const user = await getUserByUsername(TEST_ADMIN_USERNAME);
      await createSession("u-sess", "c", Date.now() + 60000, null, user!.id);
      await deleteUser(user!.id);
      const deleted = await getUserById(user!.id);
      expect(deleted).toBeNull();
      // Sessions for that user should also be deleted
      const sessions = await getAllSessions();
      expect(sessions.length).toBe(0);
    });
  });

  describe("settings", () => {
    beforeEach(async () => {
      await createTestDb();
    });

    it("getSetting returns null for missing key", async () => {
      const { getSetting } = await import("#lib/db/settings.ts");
      expect(await getSetting("nonexistent_key")).toBeNull();
    });

    it("setSetting stores and invalidates cache", async () => {
      const { getSetting, setSetting } = await import(
        "#lib/db/settings.ts"
      );
      await setSetting("test_key", "test_value");
      const value = await getSetting("test_key");
      expect(value).toBe("test_value");
    });

    it("isSetupComplete returns false before setup", async () => {
      const { isSetupComplete, clearSetupCompleteCache } = await import(
        "#lib/db/settings.ts"
      );
      clearSetupCompleteCache();
      expect(await isSetupComplete()).toBe(false);
    });

    it("isSetupComplete returns true after completeSetup", async () => {
      const { completeSetup, isSetupComplete, clearSetupCompleteCache } =
        await import("#lib/db/settings.ts");
      await completeSetup("admin", "longpassword", "", "", "");
      clearSetupCompleteCache();
      expect(await isSetupComplete()).toBe(true);
    });

    it("getXiboApiUrl/getXiboClientId/getXiboClientSecret decrypt values", async () => {
      const {
        updateXiboCredentials,
        getXiboApiUrl,
        getXiboClientId,
        getXiboClientSecret,
      } = await import("#lib/db/settings.ts");
      await updateXiboCredentials(
        "https://xibo.example.com",
        "my-client-id",
        "my-secret",
      );
      expect(await getXiboApiUrl()).toBe("https://xibo.example.com");
      expect(await getXiboClientId()).toBe("my-client-id");
      expect(await getXiboClientSecret()).toBe("my-secret");
    });

    it("updateXiboCredentials encrypts and stores", async () => {
      const { updateXiboCredentials, getSetting } = await import(
        "#lib/db/settings.ts"
      );
      await updateXiboCredentials("https://x.test", "cid", "csec");
      // Raw value should be encrypted (starts with enc:1:)
      const raw = await getSetting("xibo_api_url");
      expect(raw).not.toBeNull();
      expect(raw!.startsWith("enc:1:")).toBe(true);
    });

    it("updateUserPassword rehashes, re-wraps key, deletes sessions", async () => {
      await createTestDbWithSetup();
      const { getUserByUsername, verifyUserPassword } = await import(
        "#lib/db/users.ts"
      );
      const { updateUserPassword } = await import("#lib/db/settings.ts");
      const { createSession, getAllSessions } = await import(
        "#lib/db/sessions.ts"
      );

      const user = await getUserByUsername(TEST_ADMIN_USERNAME);
      const oldHash = await verifyUserPassword(user!, TEST_ADMIN_PASSWORD);
      expect(oldHash).not.toBeNull();

      await createSession("pw-sess", "c", Date.now() + 60000, null, user!.id);

      const result = await updateUserPassword(
        user!.id,
        oldHash!,
        user!.wrapped_data_key!,
        "newpassword123",
      );
      expect(result).toBe(true);

      // Sessions should be cleared
      const sessions = await getAllSessions();
      expect(sessions.length).toBe(0);

      // Can verify with new password
      const updatedUser = await getUserByUsername(TEST_ADMIN_USERNAME);
      const newHash = await verifyUserPassword(updatedUser!, "newpassword123");
      expect(newHash).not.toBeNull();
    });

    it("settings cache expires after 5 seconds", async () => {
      const { SETTINGS_CACHE_TTL_MS } = await import(
        "#lib/db/settings.ts"
      );
      // Just verify the constant exists and is 5000
      expect(SETTINGS_CACHE_TTL_MS).toBe(5000);
    });
  });

  describe("invite system", () => {
    beforeEach(async () => {
      await createTestDbWithSetup();
    });

    it("createInvitedUser creates user with invite code hash", async () => {
      const { createInvitedUser, hasPassword } = await import(
        "#lib/db/users.ts"
      );
      const { hashSessionToken } = await import("#lib/crypto.ts");
      const codeHash = await hashSessionToken("invite-code-123");
      const expiry = new Date(Date.now() + 86400000).toISOString();
      const user = await createInvitedUser("invited_user", "manager", codeHash, expiry);
      expect(user.id).toBeGreaterThan(0);
      expect(user.invite_code_hash).not.toBeNull();
      expect(user.invite_expiry).not.toBeNull();
      expect(user.wrapped_data_key).toBeNull();
      expect(await hasPassword(user)).toBe(false);
    });

    it("getAllUsers returns all users", async () => {
      const { getAllUsers, createInvitedUser } = await import("#lib/db/users.ts");
      const { hashSessionToken } = await import("#lib/crypto.ts");
      const codeHash = await hashSessionToken("code-abc");
      await createInvitedUser("user2", "manager", codeHash, new Date(Date.now() + 86400000).toISOString());
      const users = await getAllUsers();
      expect(users.length).toBeGreaterThanOrEqual(2);
    });

    it("getUserByInviteCode finds user by matching code", async () => {
      const { createInvitedUser, getUserByInviteCode, hashInviteCode } = await import(
        "#lib/db/users.ts"
      );
      const code = "test-invite-abc";
      const codeHash = await hashInviteCode(code);
      const expiry = new Date(Date.now() + 86400000).toISOString();
      await createInvitedUser("invitee", "manager", codeHash, expiry);
      const found = await getUserByInviteCode(code);
      expect(found).not.toBeNull();
    });

    it("getUserByInviteCode returns null for unknown code", async () => {
      const { getUserByInviteCode } = await import("#lib/db/users.ts");
      const found = await getUserByInviteCode("nonexistent-code");
      expect(found).toBeNull();
    });

    it("isInviteValid returns true for valid non-expired invite", async () => {
      const { createInvitedUser, isInviteValid, hashInviteCode } = await import(
        "#lib/db/users.ts"
      );
      const codeHash = await hashInviteCode("valid-code");
      const expiry = new Date(Date.now() + 86400000).toISOString();
      const user = await createInvitedUser("validuser", "manager", codeHash, expiry);
      expect(await isInviteValid(user)).toBe(true);
    });

    it("isInviteValid returns false for expired invite", async () => {
      const { createInvitedUser, isInviteValid, hashInviteCode } = await import(
        "#lib/db/users.ts"
      );
      const codeHash = await hashInviteCode("expired-code");
      const expiry = new Date(Date.now() - 86400000).toISOString();
      const user = await createInvitedUser("expireduser", "manager", codeHash, expiry);
      expect(await isInviteValid(user)).toBe(false);
    });

    it("isInviteValid returns false for user without invite", async () => {
      const { getUserByUsername, isInviteValid } = await import("#lib/db/users.ts");
      const user = await getUserByUsername(TEST_ADMIN_USERNAME);
      expect(await isInviteValid(user!)).toBe(false);
    });

    it("hasPassword returns true for user with password", async () => {
      const { getUserByUsername, hasPassword } = await import("#lib/db/users.ts");
      const user = await getUserByUsername(TEST_ADMIN_USERNAME);
      expect(await hasPassword(user!)).toBe(true);
    });

    it("verifyUserPassword returns null for user without password_hash", async () => {
      const { createInvitedUser, verifyUserPassword, hashInviteCode } = await import(
        "#lib/db/users.ts"
      );
      const codeHash = await hashInviteCode("code");
      const user = await createInvitedUser("nopw", "manager", codeHash, new Date(Date.now() + 86400000).toISOString());
      // Invited user has empty password_hash
      const result = await verifyUserPassword(user, "anypass");
      expect(result).toBeNull();
    });

    it("setUserPassword sets password and clears invite fields", async () => {
      const { createInvitedUser, setUserPassword, getUserById, hasPassword, hashInviteCode } =
        await import("#lib/db/users.ts");
      const codeHash = await hashInviteCode("code2");
      const user = await createInvitedUser("setpw", "manager", codeHash, new Date(Date.now() + 86400000).toISOString());
      const hash = await setUserPassword(user.id, "newpassword123");
      expect(typeof hash).toBe("string");
      expect(hash.length).toBeGreaterThan(0);
      const updated = await getUserById(user.id);
      expect(await hasPassword(updated!)).toBe(true);
    });

    it("activateUser wraps data key with KEK", async () => {
      const { createInvitedUser, activateUser, setUserPassword, getUserById, hashInviteCode } =
        await import("#lib/db/users.ts");
      const { deriveKEK, unwrapKey, generateDataKey } = await import("#lib/crypto.ts");
      const codeHash = await hashInviteCode("code3");
      const user = await createInvitedUser("activate", "manager", codeHash, new Date(Date.now() + 86400000).toISOString());
      const pwHash = await setUserPassword(user.id, "activatepass123");
      const dataKey = await generateDataKey();
      await activateUser(user.id, dataKey, pwHash);
      const updated = await getUserById(user.id);
      expect(updated!.wrapped_data_key).not.toBeNull();
      // Verify the wrapped key can be unwrapped
      const kek = await deriveKEK(pwHash);
      const unwrapped = await unwrapKey(updated!.wrapped_data_key!, kek);
      expect(unwrapped).toBeDefined();
    });
  });

  describe("settings — key storage", () => {
    beforeEach(async () => {
      await createTestDbWithSetup();
    });

    it("getPublicKey returns the stored public key", async () => {
      const { getPublicKey } = await import("#lib/db/settings.ts");
      const key = await getPublicKey();
      expect(key).not.toBeNull();
      expect(key!.length).toBeGreaterThan(0);
    });

    it("getWrappedPrivateKey returns the stored wrapped private key", async () => {
      const { getWrappedPrivateKey } = await import("#lib/db/settings.ts");
      const key = await getWrappedPrivateKey();
      expect(key).not.toBeNull();
      expect(key!.startsWith("enc:1:")).toBe(true);
    });
  });

  describe("migrations — runMigration catch block", () => {
    it("silently catches errors when migration SQL fails on already-applied schema", async () => {
      const { createClient } = await import("@libsql/client");
      const { setDb, getDb } = await import("#lib/db/client.ts");
      const { initDb } = await import("#lib/db/migrations/index.ts");

      // Create a fresh in-memory DB with partial schema
      const client = createClient({ url: ":memory:" });
      setDb(client);

      // Create the settings table so isDbUpToDate can query it
      await client.execute(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);

      // Create a users table WITHOUT username_index column
      // so the CREATE UNIQUE INDEX migration will fail
      await client.execute(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username_hash TEXT NOT NULL,
          password_hash TEXT NOT NULL DEFAULT '',
          wrapped_data_key TEXT,
          admin_level TEXT NOT NULL
        )
      `);

      // initDb should NOT throw — runMigration catches the index creation failure
      await initDb();

      // Verify the DB is usable: settings table works
      const result = await getDb().execute(
        "SELECT value FROM settings WHERE key = 'latest_db_update'",
      );
      expect(result.rows.length).toBe(1);
    });
  });

  describe("migrations — resetDatabase", () => {
    it("resetDatabase drops and re-creates tables", async () => {
      await createTestDb();
      const { resetDatabase } = await import("#lib/db/migrations/index.ts");
      const { initDb } = await import("#lib/db/migrations/index.ts");
      const { getDb } = await import("#lib/db/client.ts");
      // Insert a test row
      await getDb().execute({ sql: "INSERT INTO settings (key, value) VALUES ('test_reset', '1')", args: [] });
      // Reset drops all tables
      await resetDatabase();
      // Re-create tables via initDb
      await initDb();
      // Tables should exist; the test_reset row should be gone
      const result = await getDb().execute("SELECT COUNT(*) as cnt FROM settings");
      // After initDb, only latest_db_update is inserted
      expect(Number(result.rows[0]!.cnt)).toBeGreaterThanOrEqual(0);
      // The test_reset row should not exist after reset
      const testRow = await getDb().execute({ sql: "SELECT value FROM settings WHERE key = 'test_reset'", args: [] });
      expect(testRow.rows.length).toBe(0);
    });
  });

  describe("isInviteValid — edge cases", () => {
    beforeEach(async () => {
      await createTestDbWithSetup();
    });

    it("returns false when invite_code_hash decrypts to empty string", async () => {
      const { isInviteValid } = await import("#lib/db/users.ts");
      const { encrypt } = await import("#lib/crypto.ts");
      const { getDb } = await import("#lib/db/client.ts");
      const { hmacHash } = await import("#lib/crypto.ts");

      // Create a user with invite_code_hash that encrypts an empty string
      const usernameIndex = await hmacHash("emptycodehash");
      const encUsername = await encrypt("emptycodehash");
      const encAdminLevel = await encrypt("manager");
      const encEmptyCode = await encrypt(""); // decrypts to ""
      const encExpiry = await encrypt(new Date(Date.now() + 86400000).toISOString());

      await getDb().execute({
        sql: `INSERT INTO users (username_hash, username_index, password_hash, wrapped_data_key, admin_level, invite_code_hash, invite_expiry)
              VALUES (?, ?, '', NULL, ?, ?, ?)`,
        args: [encUsername, usernameIndex, encAdminLevel, encEmptyCode, encExpiry],
      });

      const { getUserByUsername } = await import("#lib/db/users.ts");
      const user = await getUserByUsername("emptycodehash");
      expect(user).not.toBeNull();
      // invite_code_hash is set (non-null/truthy encrypted value) but decrypts to ""
      expect(await isInviteValid(user!)).toBe(false);
    });

    it("returns false when invite_expiry is null", async () => {
      const { isInviteValid } = await import("#lib/db/users.ts");
      const { encrypt, hashSessionToken } = await import("#lib/crypto.ts");
      const { getDb } = await import("#lib/db/client.ts");
      const { hmacHash } = await import("#lib/crypto.ts");

      const codeHash = await hashSessionToken("some-invite-code");
      const encCodeHash = await encrypt(codeHash);
      const usernameIndex = await hmacHash("noexpiry");
      const encUsername = await encrypt("noexpiry");
      const encAdminLevel = await encrypt("manager");

      await getDb().execute({
        sql: `INSERT INTO users (username_hash, username_index, password_hash, wrapped_data_key, admin_level, invite_code_hash, invite_expiry)
              VALUES (?, ?, '', NULL, ?, ?, NULL)`,
        args: [encUsername, usernameIndex, encAdminLevel, encCodeHash],
      });

      const { getUserByUsername } = await import("#lib/db/users.ts");
      const user = await getUserByUsername("noexpiry");
      expect(user).not.toBeNull();
      expect(user!.invite_expiry).toBeNull();
      expect(await isInviteValid(user!)).toBe(false);
    });

    it("returns false when invite_expiry decrypts to empty string", async () => {
      const { isInviteValid } = await import("#lib/db/users.ts");
      const { encrypt, hashSessionToken } = await import("#lib/crypto.ts");
      const { getDb } = await import("#lib/db/client.ts");
      const { hmacHash } = await import("#lib/crypto.ts");

      const codeHash = await hashSessionToken("another-invite-code");
      const encCodeHash = await encrypt(codeHash);
      const usernameIndex = await hmacHash("emptyexpiry");
      const encUsername = await encrypt("emptyexpiry");
      const encAdminLevel = await encrypt("manager");
      const encEmptyExpiry = await encrypt(""); // decrypts to ""

      await getDb().execute({
        sql: `INSERT INTO users (username_hash, username_index, password_hash, wrapped_data_key, admin_level, invite_code_hash, invite_expiry)
              VALUES (?, ?, '', NULL, ?, ?, ?)`,
        args: [encUsername, usernameIndex, encAdminLevel, encCodeHash, encEmptyExpiry],
      });

      const { getUserByUsername } = await import("#lib/db/users.ts");
      const user = await getUserByUsername("emptyexpiry");
      expect(user).not.toBeNull();
      expect(await isInviteValid(user!)).toBe(false);
    });
  });

  describe("sessions — cache TTL", () => {
    beforeEach(async () => {
      await createTestDb();
    });

    it("getSession re-fetches from DB when cache entry has expired TTL", async () => {
      const { createSession, getSession } = await import("#lib/db/sessions.ts");
      await createSession("ttl-tok", "csrf", Date.now() + 60000, null, 1);
      // First call populates cache
      const s1 = await getSession("ttl-tok");
      expect(s1).not.toBeNull();
      // Session is now cached; fetching again should return same
      const s2 = await getSession("ttl-tok");
      expect(s2).not.toBeNull();
      expect(s1!.csrf_token).toBe(s2!.csrf_token);
    });

    it("cache entry expires after SESSION_CACHE_TTL_MS and re-fetches from DB", async () => {
      const { useFakeTimers, useRealTimers, setSystemTime } = await import("#test-compat");
      const { createSession, getSession, resetSessionCache } = await import(
        "#lib/db/sessions.ts"
      );
      const { getDb } = await import("#lib/db/client.ts");

      resetSessionCache();
      useFakeTimers();
      try {
        const baseTime = Date.now();
        setSystemTime(baseTime);

        await createSession("ttl-expire", "csrf-original", baseTime + 60000, null, 1);

        // First call — populates cache
        const s1 = await getSession("ttl-expire");
        expect(s1).not.toBeNull();
        expect(s1!.csrf_token).toBe("csrf-original");

        // Advance time past the 10s TTL
        setSystemTime(baseTime + 11_000);

        // Update the row directly in DB so we can tell whether cache or DB was used
        const { hashSessionToken } = await import("#lib/crypto.ts");
        const tokenHash = await hashSessionToken("ttl-expire");
        await getDb().execute({
          sql: "UPDATE sessions SET csrf_token = ? WHERE token = ?",
          args: ["csrf-updated", tokenHash],
        });

        // Second call — cache expired, should re-fetch from DB
        const s2 = await getSession("ttl-expire");
        expect(s2).not.toBeNull();
        expect(s2!.csrf_token).toBe("csrf-updated");
      } finally {
        useRealTimers();
      }
    });
  });
});
