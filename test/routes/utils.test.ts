import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  setSystemTime,
  useFakeTimers,
  useRealTimers,
} from "#test-compat";
import type { AdminLevel } from "#lib/types.ts";
import {
  createTestDbWithSetup,
  getCsrfTokenFromCookie,
  loginAsAdmin,
  mockFormRequest,
  mockRequest,
  resetDb,
} from "#test-utils";

const handle = async (req: Request): Promise<Response> => {
  const { handleRequest } = await import("#routes");
  return handleRequest(req);
};

/** Create a user with a given role, activate, and log in — returns cookie */
const createAndLoginRole = async (
  username: string,
  role: AdminLevel,
  password: string,
): Promise<string> => {
  const { createInvitedUser, setUserPassword, activateUser, hashInviteCode } =
    await import("#lib/db/users.ts");

  const codeHash = await hashInviteCode(`${username}-invite`);
  const user = await createInvitedUser(
    username,
    role,
    codeHash,
    new Date(Date.now() + 86400000).toISOString(),
  );
  const pwHash = await setUserPassword(user.id, password);
  const dataKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  await activateUser(user.id, dataKey, pwHash);

  const loginRes = await handle(
    mockFormRequest("/admin/login", { username, password }),
  );
  return loginRes.headers.get("set-cookie") || "";
};

/** Create a manager user, activate, and log in — returns cookie */
const createAndLoginManager = (): Promise<string> =>
  createAndLoginRole("manager_user", "manager", "managerpass1");

/** Create a user-role user, activate, and log in — returns cookie */
const createAndLoginUser = (): Promise<string> =>
  createAndLoginRole("basic_user", "user", "userpass123");

describe("routes/utils", () => {
  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
  });

  afterEach(() => {
    resetDb();
  });

  describe("getClientIp", () => {
    it("returns address from server.requestIP when available", async () => {
      const { getClientIp } = await import("#routes/utils.ts");
      const req = mockRequest("/admin");
      const ip = getClientIp(req, {
        requestIP: () => ({ address: "192.168.1.1" }),
      });
      expect(ip).toBe("192.168.1.1");
    });

    it("returns direct when server.requestIP returns null", async () => {
      const { getClientIp } = await import("#routes/utils.ts");
      const req = mockRequest("/admin");
      const ip = getClientIp(req, {
        requestIP: () => null,
      });
      expect(ip).toBe("direct");
    });

    it("returns direct when no server provided", async () => {
      const { getClientIp } = await import("#routes/utils.ts");
      const req = mockRequest("/admin");
      const ip = getClientIp(req);
      expect(ip).toBe("direct");
    });
  });

  describe("csrfCookie", () => {
    it("generates cookie string with default name", async () => {
      const { csrfCookie } = await import("#routes/utils.ts");
      const result = csrfCookie("tok-123", "/setup");
      expect(result).toContain("csrf_token=tok-123");
      expect(result).toContain("HttpOnly");
      expect(result).toContain("Secure");
      expect(result).toContain("SameSite=Strict");
      expect(result).toContain("Path=/setup");
      expect(result).toContain("Max-Age=3600");
    });

    it("supports custom cookie name", async () => {
      const { csrfCookie } = await import("#routes/utils.ts");
      const result = csrfCookie("tok-456", "/path", "my_csrf");
      expect(result).toContain("my_csrf=tok-456");
    });
  });

  describe("requireOwnerOnly", () => {
    it("returns 403 for non-owner user accessing owner-only route", async () => {
      const mgrCookie = await createAndLoginManager();
      const res = await handle(
        mockRequest("/admin/settings", { headers: { cookie: mgrCookie } }),
      );
      expect(res.status).toBe(403);
    });
  });

  describe("withOwnerAuthForm", () => {
    it("returns 403 for manager POSTing to owner-only form", async () => {
      const mgrCookie = await createAndLoginManager();
      const csrf = await getCsrfTokenFromCookie(mgrCookie);

      const res = await handle(
        mockFormRequest(
          "/admin/settings/xibo",
          {
            csrf_token: csrf!,
            xibo_api_url: "http://x",
            xibo_client_id: "a",
            xibo_client_secret: "b",
          },
          mgrCookie,
        ),
      );
      expect(res.status).toBe(403);
    });
  });

  describe("requireManagerOrAbove", () => {
    it("returns 403 for user role accessing manager-or-above route", async () => {
      const userCookie = await createAndLoginUser();
      const res = await handle(
        mockRequest("/admin/users", { headers: { cookie: userCookie } }),
      );
      expect(res.status).toBe(403);
    });

    it("allows manager to access manager-or-above route", async () => {
      const mgrCookie = await createAndLoginManager();
      const res = await handle(
        mockRequest("/admin/users", { headers: { cookie: mgrCookie } }),
      );
      expect(res.status).toBe(200);
    });
  });

  describe("withManagerAuthForm", () => {
    it("returns 403 for user role POSTing to manager-or-above form", async () => {
      const userCookie = await createAndLoginUser();
      const csrf = await getCsrfTokenFromCookie(userCookie);

      const res = await handle(
        mockFormRequest(
          "/admin/users",
          { username: "newuser", admin_level: "user", csrf_token: csrf! },
          userCookie,
        ),
      );
      expect(res.status).toBe(403);
    });
  });

  describe("auth session cache", () => {
    it("returns cached auth session within TTL window", async () => {
      const { getAuthenticatedSession } =
        await import("#routes/utils.ts");
      const { getDb } = await import("#lib/db/client.ts");

      const { cookie } = await loginAsAdmin();
      const req = () =>
        mockRequest("/admin", { headers: { cookie } });

      // First call populates cache
      const s1 = await getAuthenticatedSession(req());
      expect(s1).not.toBeNull();
      expect(s1!.adminLevel).toBe("owner");

      // Delete user directly from DB (bypasses cache invalidation)
      await getDb().execute({
        sql: "DELETE FROM users WHERE id = ?",
        args: [s1!.userId],
      });

      // Second call returns cached result despite user being gone from DB
      const s2 = await getAuthenticatedSession(req());
      expect(s2).not.toBeNull();
      expect(s2!.userId).toBe(s1!.userId);
      expect(s2!.adminLevel).toBe("owner");
    });

    it("expires auth session cache after TTL and re-validates", async () => {
      const { getAuthenticatedSession, resetAuthSessionCache } =
        await import("#routes/utils.ts");
      const { resetSessionCache } = await import("#lib/db/sessions.ts");
      const { getDb } = await import("#lib/db/client.ts");

      // Login before activating fake timers (needs real crypto timing)
      const { cookie } = await loginAsAdmin();
      const req = () =>
        mockRequest("/admin", { headers: { cookie } });

      resetAuthSessionCache();
      resetSessionCache();
      useFakeTimers();
      try {
        const baseTime = Date.now();
        setSystemTime(baseTime);

        // First call populates cache
        const s1 = await getAuthenticatedSession(req());
        expect(s1).not.toBeNull();

        // Delete user directly from DB
        await getDb().execute({
          sql: "DELETE FROM users WHERE id = ?",
          args: [s1!.userId],
        });

        // Still within TTL — returns cached
        setSystemTime(baseTime + 5_000);
        const s2 = await getAuthenticatedSession(req());
        expect(s2).not.toBeNull();
        expect(s2!.userId).toBe(s1!.userId);

        // Advance past TTL — cache expired, re-validates, user gone
        setSystemTime(baseTime + 11_000);
        const s3 = await getAuthenticatedSession(req());
        expect(s3).toBeNull();
      } finally {
        useRealTimers();
      }
    });

    it("clears auth session cache when session is deleted", async () => {
      const { getAuthenticatedSession } = await import("#routes/utils.ts");
      const { deleteSession } = await import("#lib/db/sessions.ts");

      const { cookie } = await loginAsAdmin();
      const req = () =>
        mockRequest("/admin", { headers: { cookie } });

      // First call populates cache
      const s1 = await getAuthenticatedSession(req());
      expect(s1).not.toBeNull();

      // Delete session (triggers cache invalidation via listener)
      await deleteSession(s1!.token);

      // Cache cleared — goes to DB, session not found
      const s2 = await getAuthenticatedSession(req());
      expect(s2).toBeNull();
    });

    it("clears auth session cache when user is deleted", async () => {
      const { getAuthenticatedSession } = await import("#routes/utils.ts");
      const { deleteUser } = await import("#lib/db/users.ts");

      const { cookie } = await loginAsAdmin();
      const req = () =>
        mockRequest("/admin", { headers: { cookie } });

      // First call populates cache
      const s1 = await getAuthenticatedSession(req());
      expect(s1).not.toBeNull();

      // Delete user (clears session caches via resetSessionCache)
      await deleteUser(s1!.userId);

      // Cache cleared — goes to DB, session not found
      const s2 = await getAuthenticatedSession(req());
      expect(s2).toBeNull();
    });
  });
});
