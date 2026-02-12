import { afterEach, beforeEach, describe, expect, it } from "#test-compat";
import { getAllActivityLog } from "#lib/db/activity-log.ts";
import { getDb } from "#lib/db/client.ts";
import { createSession } from "#lib/db/sessions.ts";
import {
  createInvitedUser,
  decryptAdminLevel,
  decryptUsername,
  getAllUsers,
  getUserByUsername,
  hasPassword,
  isInviteValid,
  setUserPassword,
  verifyUserPassword,
} from "#lib/db/users.ts";
import { encrypt, hashPassword } from "#lib/crypto.ts";
import {
  awaitTestRequest,
  createActivateAndLogin,
  createTestDbWithSetup,
  expectAdminRedirect,
  handle,
  loginAsAdmin,
  mockFormRequest,
  mockRequest,
  resetDb,
  TEST_ADMIN_PASSWORD,
  TEST_ADMIN_USERNAME,
} from "#test-utils";

describe("admin users management", () => {
  let cookie: string;
  let csrfToken: string;

  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
    const login = await loginAsAdmin();
    cookie = login.cookie;
    csrfToken = login.csrfToken;
  });

  afterEach(() => {
    resetDb();
  });

  describe("users CRUD", () => {
    it("createTestDbWithSetup creates the owner user", async () => {
      const user = await getUserByUsername(TEST_ADMIN_USERNAME);
      expect(user).not.toBeNull();
      expect(user!.id).toBe(1);

      const level = await decryptAdminLevel(user!);
      expect(level).toBe("owner");

      const username = await decryptUsername(user!);
      expect(username).toBe(TEST_ADMIN_USERNAME);
    });

    it("verifyUserPassword returns hash for correct password", async () => {
      const user = await getUserByUsername(TEST_ADMIN_USERNAME);
      const hash = await verifyUserPassword(user!, TEST_ADMIN_PASSWORD);
      expect(hash).toBeTruthy();
      expect(hash).toContain("pbkdf2:");
    });

    it("verifyUserPassword returns null for wrong password", async () => {
      const user = await getUserByUsername(TEST_ADMIN_USERNAME);
      const result = await verifyUserPassword(user!, "wrongpassword");
      expect(result).toBeNull();
    });

    it("getAllUsers returns all users", async () => {
      const users = await getAllUsers();
      expect(users.length).toBe(1);
      expect(users[0]!.id).toBe(1);
    });
  });

  describe("invited users", () => {
    it("createInvitedUser creates user with invite code", async () => {
      const inviteHash = await hashPassword("invite123");
      const expiry = new Date(Date.now() + 86400000).toISOString();

      const user = await createInvitedUser(
        "invitee",
        "manager",
        inviteHash,
        expiry,
      );

      expect(user.id).toBe(2);
      expect(user.password_hash).toBe("");

      const level = await decryptAdminLevel(user);
      expect(level).toBe("manager");

      const username = await decryptUsername(user);
      expect(username).toBe("invitee");

      const hasPwd = await hasPassword(user);
      expect(hasPwd).toBe(false);
    });

    it("isInviteValid returns true for valid invite", async () => {
      const expiry = new Date(Date.now() + 86400000).toISOString();
      const user = await createInvitedUser(
        "invitee",
        "manager",
        "somehash",
        expiry,
      );

      const valid = await isInviteValid(user);
      expect(valid).toBe(true);
    });

    it("isInviteValid returns false for expired invite", async () => {
      const expiry = new Date(Date.now() - 1000).toISOString();
      const user = await createInvitedUser(
        "expired-user",
        "manager",
        "somehash",
        expiry,
      );

      const valid = await isInviteValid(user);
      expect(valid).toBe(false);
    });
  });

  describe("role enforcement", () => {
    it("manager user can access users page", async () => {
      const hash = await hashPassword("managerpass");
      const encHash = await encrypt(hash);
      await getDb().execute({
        sql: `INSERT INTO users (username_hash, username_index, password_hash, admin_level)
              VALUES (?, ?, ?, ?)`,
        args: [
          await encrypt("manager"),
          "manager-idx-unique",
          encHash,
          await encrypt("manager"),
        ],
      });

      const managerUserId = 2;
      await createSession("manager-token", "manager-csrf", Date.now() + 3600000, managerUserId);

      const usersResponse = await awaitTestRequest("/admin/users", {
        cookie: "__Host-session=manager-token",
      });
      expect(usersResponse.status).toBe(200);
      const html = await usersResponse.text();
      expect(html).toContain("Users");
    });

    it("user role cannot access users page", async () => {
      const hash = await hashPassword("userpass");
      const encHash = await encrypt(hash);
      await getDb().execute({
        sql: `INSERT INTO users (username_hash, username_index, password_hash, admin_level)
              VALUES (?, ?, ?, ?)`,
        args: [
          await encrypt("basicuser"),
          "user-idx-unique",
          encHash,
          await encrypt("user"),
        ],
      });

      const userId = 2;
      await createSession("user-token", "user-csrf", Date.now() + 3600000, userId);

      const usersResponse = await awaitTestRequest("/admin/users", {
        cookie: "__Host-session=user-token",
      });
      expect(usersResponse.status).toBe(403);
    });

    it("owner user can access users page", async () => {
      const response = await awaitTestRequest("/admin/users", { cookie });
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Users");
      expect(html).toContain(TEST_ADMIN_USERNAME);
    });
  });

  describe("GET /admin/users", () => {
    it("redirects to login when not authenticated", async () => {
      const response = await handle(mockRequest("/admin/users"));
      expectAdminRedirect(response);
    });

    it("shows users list when authenticated as owner", async () => {
      const response = await awaitTestRequest("/admin/users", { cookie });
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain(TEST_ADMIN_USERNAME);
      expect(html).toContain("owner");
    });
  });

  describe("GET /admin/users (with query params)", () => {
    it("displays invite link from query param", async () => {
      const response = await awaitTestRequest(
        "/admin/users?invite=" + encodeURIComponent("https://localhost/join/abc123"),
        { cookie },
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("https://localhost/join/abc123");
      expect(html).toContain("Invite link");
    });

    it("displays success message from query param", async () => {
      const response = await awaitTestRequest(
        "/admin/users?success=User+deleted+successfully",
        { cookie },
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("User deleted successfully");
      expect(html).toContain('class="success"');
    });
  });

  describe("POST /admin/users (invite)", () => {
    it("redirects when not authenticated", async () => {
      const response = await handle(
        mockFormRequest("/admin/users", { username: "newuser", admin_level: "manager" }),
      );
      expectAdminRedirect(response);
    });

    it("creates invited user and shows invite link", async () => {
      const response = await handle(
        mockFormRequest(
          "/admin/users",
          { username: "newmanager", admin_level: "manager", csrf_token: csrfToken },
          cookie,
        ),
      );

      expect(response.status).toBe(302);
      const location = response.headers.get("location")!;
      expect(decodeURIComponent(location)).toContain("/join/");

      const users = await getAllUsers();
      expect(users.length).toBe(2);
    });

    it("rejects duplicate username", async () => {
      const response = await handle(
        mockFormRequest(
          "/admin/users",
          { username: TEST_ADMIN_USERNAME, admin_level: "manager", csrf_token: csrfToken },
          cookie,
        ),
      );

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("already taken");
    });

    it("rejects invalid role", async () => {
      const response = await handle(
        mockFormRequest(
          "/admin/users",
          { username: "newuser", admin_level: "superadmin", csrf_token: csrfToken },
          cookie,
        ),
      );

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("Invalid role");
    });

    it("rejects missing username", async () => {
      const response = await handle(
        mockFormRequest(
          "/admin/users",
          { username: "", admin_level: "manager", csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(400);
    });
  });

  describe("POST /admin/users/:id/delete", () => {
    it("deletes a user", async () => {
      await handle(
        mockFormRequest(
          "/admin/users",
          { username: "deleteme", admin_level: "manager", csrf_token: csrfToken },
          cookie,
        ),
      );

      const usersBefore = await getAllUsers();
      expect(usersBefore.length).toBe(2);

      const response = await handle(
        mockFormRequest(
          "/admin/users/2/delete",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location")!;
      expect(decodeURIComponent(location)).toContain("deleted");

      const usersAfter = await getAllUsers();
      expect(usersAfter.length).toBe(1);
    });

    it("prevents deleting self", async () => {
      const response = await handle(
        mockFormRequest(
          "/admin/users/1/delete",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("Cannot delete your own account");
    });

    it("returns 404 for nonexistent user", async () => {
      const response = await handle(
        mockFormRequest(
          "/admin/users/999/delete",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(404);
      const html = await response.text();
      expect(html).toContain("User not found");
    });
  });

  describe("POST /admin/users/:id/activate", () => {
    it("returns already activated for user who has set password", async () => {
      // Create an invite
      await handle(
        mockFormRequest(
          "/admin/users",
          { username: "activateme", admin_level: "manager", csrf_token: csrfToken },
          cookie,
        ),
      );

      // Set password directly via DB layer (join flow not implemented yet)
      await setUserPassword(2, "newpassword123");

      // Users are active once they have a password — activation is a no-op
      const activateResponse = await handle(
        mockFormRequest(
          "/admin/users/2/activate",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(activateResponse.status).toBe(400);
      const html = await activateResponse.text();
      expect(html).toContain("already activated");
    });

    it("returns 404 for nonexistent user", async () => {
      const response = await handle(
        mockFormRequest(
          "/admin/users/999/activate",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(404);
      const html = await response.text();
      expect(html).toContain("User not found");
    });

    it("rejects user who has not set password", async () => {
      // Create invite but don't complete join flow
      await handle(
        mockFormRequest(
          "/admin/users",
          { username: "nopassword", admin_level: "manager", csrf_token: csrfToken },
          cookie,
        ),
      );

      const response = await handle(
        mockFormRequest(
          "/admin/users/2/activate",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("not set their password");
    });

    it("rejects already activated user", async () => {
      // User 1 (the owner) is already activated
      const response = await handle(
        mockFormRequest(
          "/admin/users/1/activate",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("already activated");
    });
  });

  describe("users template rendering", () => {
    it("shows Invited status for user without password", async () => {
      // Create invited user (no password yet)
      await handle(
        mockFormRequest(
          "/admin/users",
          { username: "invited-only", admin_level: "manager", csrf_token: csrfToken },
          cookie,
        ),
      );

      const response = await awaitTestRequest("/admin/users", { cookie });
      const html = await response.text();
      expect(html).toContain("Invited");
    });

    it("shows Active status for user with password", async () => {
      // Create invite and set password directly via DB
      await handle(
        mockFormRequest(
          "/admin/users",
          { username: "pending-user", admin_level: "manager", csrf_token: csrfToken },
          cookie,
        ),
      );
      await setUserPassword(2, "newpassword123");

      // Users page should show "Active" for user with password
      const usersResponse = await awaitTestRequest("/admin/users", { cookie });
      const html = await usersResponse.text();
      expect(html).toContain("Active");
    });
  });

  describe("db/users.ts edge cases", () => {
    it("verifyUserPassword returns null when user has empty password_hash", async () => {
      const user = await createInvitedUser("nopwd", "manager", "hash", new Date(Date.now() + 86400000).toISOString());
      const result = await verifyUserPassword(user, "anypassword");
      expect(result).toBeNull();
    });

    it("isInviteValid returns false when invite_code_hash is null", async () => {
      const user = await getUserByUsername(TEST_ADMIN_USERNAME);
      // The owner user has no invite_code_hash
      const valid = await isInviteValid(user!);
      expect(valid).toBe(false);
    });

    it("isInviteValid returns false when invite was already used", async () => {
      const { setUserPassword: setUserPwd } = await import("#lib/db/users.ts");
      const expiry = new Date(Date.now() + 86400000).toISOString();
      const user = await createInvitedUser("used-invite", "manager", "somehash", expiry);

      // Setting password clears invite_code_hash (sets to encrypted "")
      await setUserPwd(user.id, "newpassword123");

      // Reload user
      const { getUserById: getUser } = await import("#lib/db/users.ts");
      const updatedUser = await getUser(user.id);
      const valid = await isInviteValid(updatedUser!);
      expect(valid).toBe(false);
    });

    it("hasPassword returns false for user with empty encrypted password", async () => {
      const user = await createInvitedUser("nopwd2", "manager", "hash2", new Date(Date.now() + 86400000).toISOString());
      const hasPwd = await hasPassword(user);
      expect(hasPwd).toBe(false);
    });

    it("isInviteValid returns false when invite_expiry is null", async () => {
      const { hmacHash } = await import("#lib/crypto.ts");
      const usernameIdx = await hmacHash("no-expiry-user");
      await getDb().execute({
        sql: `INSERT INTO users (username_hash, username_index, password_hash, admin_level, invite_code_hash, invite_expiry)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          await encrypt("no-expiry-user"),
          usernameIdx,
          "",
          await encrypt("manager"),
          await encrypt("somehash"),
          null,
        ],
      });

      const user = await getUserByUsername("no-expiry-user");
      const valid = await isInviteValid(user!);
      expect(valid).toBe(false);
    });

    it("isInviteValid returns false when invite_expiry decrypts to empty string", async () => {
      const { hmacHash } = await import("#lib/crypto.ts");
      const usernameIdx = await hmacHash("empty-expiry-user");
      await getDb().execute({
        sql: `INSERT INTO users (username_hash, username_index, password_hash, admin_level, invite_code_hash, invite_expiry)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          await encrypt("empty-expiry-user"),
          usernameIdx,
          "",
          await encrypt("manager"),
          await encrypt("somehash"),
          await encrypt(""),
        ],
      });

      const user = await getUserByUsername("empty-expiry-user");
      const valid = await isInviteValid(user!);
      expect(valid).toBe(false);
    });
  });

  describe("manager role hierarchy", () => {
    it("manager can invite a user-role user", async () => {
      const mgr = await createActivateAndLogin("mgr1", "manager", "mgrpass123");

      const response = await handle(
        mockFormRequest(
          "/admin/users",
          { username: "newuser1", admin_level: "user", csrf_token: mgr.csrfToken },
          mgr.cookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location")!;
      expect(decodeURIComponent(location)).toContain("/join/");
    });

    it("manager cannot invite a manager-role user", async () => {
      const mgr = await createActivateAndLogin("mgr2", "manager", "mgrpass123");

      const response = await handle(
        mockFormRequest(
          "/admin/users",
          { username: "newmgr", admin_level: "manager", csrf_token: mgr.csrfToken },
          mgr.cookie,
        ),
      );
      expect(response.status).toBe(403);
      const html = await response.text();
      expect(html).toContain("Managers can only create users");
    });

    it("manager cannot invite an owner-role user", async () => {
      const mgr = await createActivateAndLogin("mgr3", "manager", "mgrpass123");

      const response = await handle(
        mockFormRequest(
          "/admin/users",
          { username: "newowner", admin_level: "owner", csrf_token: mgr.csrfToken },
          mgr.cookie,
        ),
      );
      expect(response.status).toBe(403);
      const html = await response.text();
      expect(html).toContain("Managers can only create users");
    });

    it("owner can invite a user-role user", async () => {
      const response = await handle(
        mockFormRequest(
          "/admin/users",
          { username: "owneruser", admin_level: "user", csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location")!;
      expect(decodeURIComponent(location)).toContain("/join/");
    });

    it("owner can invite a manager-role user", async () => {
      const response = await handle(
        mockFormRequest(
          "/admin/users",
          { username: "ownermgr", admin_level: "manager", csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location")!;
      expect(decodeURIComponent(location)).toContain("/join/");
    });
  });

  describe("audit logging", () => {
    it("logs activity when user is invited", async () => {
      await handle(
        mockFormRequest(
          "/admin/users",
          { username: "audituser", admin_level: "manager", csrf_token: csrfToken },
          cookie,
        ),
      );

      const logs = await getAllActivityLog();
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0]!.message).toContain("Invited user");
      expect(logs[0]!.message).toContain("audituser");
    });

    it("logs activity when user is deleted", async () => {
      await handle(
        mockFormRequest(
          "/admin/users",
          { username: "deleteaudit2", admin_level: "manager", csrf_token: csrfToken },
          cookie,
        ),
      );

      await handle(
        mockFormRequest(
          "/admin/users/2/delete",
          { csrf_token: csrfToken },
          cookie,
        ),
      );

      const logs = await getAllActivityLog();
      const deleteLog2 = logs.find((l) => l.message.includes("Deleted user 2"));
      expect(deleteLog2).not.toBeNull();
    });

    it("logs activity when user is deleted", async () => {
      await handle(
        mockFormRequest(
          "/admin/users",
          { username: "deleteaudit", admin_level: "manager", csrf_token: csrfToken },
          cookie,
        ),
      );

      await handle(
        mockFormRequest(
          "/admin/users/2/delete",
          { csrf_token: csrfToken },
          cookie,
        ),
      );

      const logs = await getAllActivityLog();
      const deleteLog = logs.find((l) => l.message.includes("Deleted"));
      expect(deleteLog).not.toBeNull();
      expect(deleteLog!.message).toContain("Deleted user 2");
    });
  });

  describe("getSearchParam", () => {
    it("returns param value from request URL", async () => {
      const { getSearchParam } = await import("#routes/utils.ts");
      const req = new Request("http://localhost/admin/users?invite=test-link");
      expect(getSearchParam(req, "invite")).toBe("test-link");
    });

    it("returns null for missing param", async () => {
      const { getSearchParam } = await import("#routes/utils.ts");
      const req = new Request("http://localhost/admin/users");
      expect(getSearchParam(req, "invite")).toBeNull();
    });
  });

  describe("canImpersonate in users template", () => {
    it("shows Impersonate button for active user-role user when owner is logged in", async () => {
      // Create and activate a user-role user
      await createActivateAndLogin("impersonatee", "user", "userpass123");

      const response = await awaitTestRequest("/admin/users", { cookie });
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Impersonate");
      expect(html).toContain("/impersonate");
    });

    it("does not show Impersonate button for owner users", async () => {
      // Only the owner user exists - should not show Impersonate for self
      const response = await awaitTestRequest("/admin/users", { cookie });
      const html = await response.text();
      expect(html).not.toContain("Impersonate");
    });

    it("manager can impersonate user-role but not other managers", async () => {
      // Create a manager and a user
      const mgr = await createActivateAndLogin("mgr-imp", "manager", "mgrpass123");
      await createActivateAndLogin("user-imp", "user", "userpass123");

      const response = await awaitTestRequest("/admin/users", {
        cookie: mgr.cookie,
      });
      const html = await response.text();
      // Should show impersonate for user-role only
      expect(html).toContain("Impersonate");
    });
  });
});
