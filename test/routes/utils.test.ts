import { afterEach, beforeEach, describe, expect, it } from "#test-compat";
import {
  createTestDbWithSetup,
  getCsrfTokenFromCookie,
  mockFormRequest,
  mockRequest,
  resetDb,
} from "#test-utils";

const handle = async (req: Request): Promise<Response> => {
  const { handleRequest } = await import("#routes");
  return handleRequest(req);
};

/** Create a manager user, activate, and log in — returns cookie */
const createAndLoginManager = async (): Promise<string> => {
  const { createInvitedUser, setUserPassword, activateUser, hashInviteCode } =
    await import("#lib/db/users.ts");

  const codeHash = await hashInviteCode("mgr-invite");
  const user = await createInvitedUser(
    "manager_user",
    "manager",
    codeHash,
    new Date(Date.now() + 86400000).toISOString(),
  );
  const pwHash = await setUserPassword(user.id, "managerpass1");
  const dataKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  await activateUser(user.id, dataKey, pwHash);

  const loginRes = await handle(
    mockFormRequest("/admin/login", {
      username: "manager_user",
      password: "managerpass1",
    }),
  );
  return loginRes.headers.get("set-cookie") || "";
};

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

  describe("requireOwnerRole", () => {
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
});
