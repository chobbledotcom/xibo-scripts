import { afterEach, beforeEach, describe, expect, it } from "#test-compat";
import {
  createTestDbWithSetup,
  loginAsAdmin,
  mockFormRequest,
  mockRequest,
  resetDb,
  TEST_ADMIN_PASSWORD,
  TEST_ADMIN_USERNAME,
} from "#test-utils";
import { clearToken } from "#xibo/client.ts";
import { cacheInvalidateAll } from "#xibo/cache.ts";
import { updateXiboCredentials, getXiboApiUrl, getXiboClientId } from "#lib/db/settings.ts";

const handle = async (req: Request): Promise<Response> => {
  const { handleRequest } = await import("#routes");
  return handleRequest(req);
};

const mockXiboFetch = (
  handler: (url: string) => Response | null,
): { restore: () => void } => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;
    const result = handler(url);
    if (result) return Promise.resolve(result);
    return originalFetch(input, init);
  }) as typeof globalThis.fetch;
  return { restore: () => { globalThis.fetch = originalFetch; } };
};

const jsonResponse = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const tokenResponse = (): Response =>
  jsonResponse({ access_token: "tok", token_type: "Bearer", expires_in: 3600 });

describe("settings", () => {
  let cookie: string;
  let csrfToken: string;

  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
    clearToken();
    await cacheInvalidateAll();
    const login = await loginAsAdmin();
    cookie = login.cookie;
    csrfToken = login.csrfToken;
  });

  afterEach(() => {
    clearToken();
    resetDb();
  });

  describe("GET /admin/settings (unauthenticated)", () => {
    it("redirects to /admin", async () => {
      const res = await handle(mockRequest("/admin/settings"));
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/admin");
    });
  });

  describe("GET /admin/settings (owner)", () => {
    it("returns 200 with settings page", async () => {
      const res = await handle(
        mockRequest("/admin/settings", { headers: { cookie } }),
      );
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("Settings");
    });

    it("shows 'Not configured' when no Xibo credentials", async () => {
      const res = await handle(
        mockRequest("/admin/settings", { headers: { cookie } }),
      );
      const body = await res.text();
      expect(body).toContain("Not configured");
    });

    it("shows current Xibo URL when configured", async () => {
      await updateXiboCredentials("https://xibo.example.com", "cid", "csec");
      const res = await handle(
        mockRequest("/admin/settings", { headers: { cookie } }),
      );
      const body = await res.text();
      expect(body).toContain("https://xibo.example.com");
    });

    it("shows Xibo credentials form", async () => {
      const res = await handle(
        mockRequest("/admin/settings", { headers: { cookie } }),
      );
      const body = await res.text();
      expect(body).toContain("Xibo CMS Connection");
      expect(body).toContain('action="/admin/settings/xibo"');
    });

    it("shows change password form", async () => {
      const res = await handle(
        mockRequest("/admin/settings", { headers: { cookie } }),
      );
      const body = await res.text();
      expect(body).toContain("Change Password");
      expect(body).toContain('action="/admin/settings/password"');
    });

    it("shows success message from query parameter", async () => {
      const res = await handle(
        mockRequest("/admin/settings?success=Credentials+updated", {
          headers: { cookie },
        }),
      );
      const body = await res.text();
      expect(body).toContain("Credentials updated");
    });
  });

  describe("POST /admin/settings/xibo — update credentials", () => {
    it("rejects without CSRF token", async () => {
      const res = await handle(
        mockFormRequest(
          "/admin/settings/xibo",
          { xibo_api_url: "http://x", xibo_client_id: "a", xibo_client_secret: "b" },
          cookie,
        ),
      );
      expect(res.status).toBe(403);
    });

    it("rejects unauthenticated", async () => {
      const res = await handle(
        mockFormRequest("/admin/settings/xibo", {
          csrf_token: "fake",
          xibo_api_url: "http://x",
          xibo_client_id: "a",
          xibo_client_secret: "b",
        }),
      );
      expect(res.status).toBe(302);
    });

    it("validates required fields", async () => {
      const res = await handle(
        mockFormRequest(
          "/admin/settings/xibo",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(res.status).toBe(400);
    });

    it("saves encrypted credentials and redirects with success message", async () => {
      const res = await handle(
        mockFormRequest(
          "/admin/settings/xibo",
          {
            csrf_token: csrfToken,
            xibo_api_url: "https://new.xibo.test",
            xibo_client_id: "new-id",
            xibo_client_secret: "new-secret",
          },
          cookie,
        ),
      );
      expect(res.status).toBe(302);
      const loc = res.headers.get("location") || "";
      expect(loc).toContain("/admin/settings");
      expect(loc).toContain("success=");
    });

    it("credentials are readable after save (round-trip)", async () => {
      await handle(
        mockFormRequest(
          "/admin/settings/xibo",
          {
            csrf_token: csrfToken,
            xibo_api_url: "https://roundtrip.test",
            xibo_client_id: "rt-id",
            xibo_client_secret: "rt-secret",
          },
          cookie,
        ),
      );
      const url = await getXiboApiUrl();
      const clientId = await getXiboClientId();
      expect(url).toBe("https://roundtrip.test");
      expect(clientId).toBe("rt-id");
    });
  });

  describe("POST /admin/settings/test — connection test", () => {
    it("rejects unauthenticated", async () => {
      const res = await handle(
        mockFormRequest("/admin/settings/test", { csrf_token: "x" }),
      );
      expect(res.status).toBe(302);
    });

    it("shows 'not configured' when no Xibo credentials saved", async () => {
      const res = await handle(
        mockFormRequest(
          "/admin/settings/test",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("not configured");
    });

    it("shows success result with version when Xibo reachable", async () => {
      await updateXiboCredentials("https://xibo.test", "id", "secret");
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token")) return tokenResponse();
        if (url.includes("/api/about"))
          return jsonResponse({ version: "4.0.0" });
        return null;
      });
      try {
        const res = await handle(
          mockFormRequest(
            "/admin/settings/test",
            { csrf_token: csrfToken },
            cookie,
          ),
        );
        const body = await res.text();
        expect(body).toContain("Connected");
        expect(body).toContain("4.0.0");
      } finally {
        mock.restore();
      }
    });

    it("shows failure message when Xibo unreachable", async () => {
      await updateXiboCredentials("https://xibo.test", "id", "secret");
      const mock = mockXiboFetch((url) => {
        if (url.includes("/api/authorize/access_token"))
          return jsonResponse({}, 401);
        return null;
      });
      try {
        const res = await handle(
          mockFormRequest(
            "/admin/settings/test",
            { csrf_token: csrfToken },
            cookie,
          ),
        );
        const body = await res.text();
        expect(body).toContain("failed");
      } finally {
        mock.restore();
      }
    });
  });

  describe("POST /admin/settings/password — change password", () => {
    it("rejects unauthenticated", async () => {
      const res = await handle(
        mockFormRequest("/admin/settings/password", { csrf_token: "x" }),
      );
      expect(res.status).toBe(302);
    });

    it("rejects without CSRF", async () => {
      const res = await handle(
        mockFormRequest(
          "/admin/settings/password",
          { current_password: "a", new_password: "b", new_password_confirm: "b" },
          cookie,
        ),
      );
      expect(res.status).toBe(403);
    });

    it("rejects missing current_password", async () => {
      const res = await handle(
        mockFormRequest(
          "/admin/settings/password",
          {
            csrf_token: csrfToken,
            new_password: "newpassword1",
            new_password_confirm: "newpassword1",
          },
          cookie,
        ),
      );
      expect(res.status).toBe(400);
    });

    it("rejects missing new_password", async () => {
      const res = await handle(
        mockFormRequest(
          "/admin/settings/password",
          {
            csrf_token: csrfToken,
            current_password: TEST_ADMIN_PASSWORD,
            new_password_confirm: "newpassword1",
          },
          cookie,
        ),
      );
      expect(res.status).toBe(400);
    });

    it("rejects new password shorter than 8 chars", async () => {
      const res = await handle(
        mockFormRequest(
          "/admin/settings/password",
          {
            csrf_token: csrfToken,
            current_password: TEST_ADMIN_PASSWORD,
            new_password: "short",
            new_password_confirm: "short",
          },
          cookie,
        ),
      );
      expect(res.status).toBe(400);
      const body = await res.text();
      expect(body).toContain("8 characters");
    });

    it("rejects mismatched new_password and new_password_confirm", async () => {
      const res = await handle(
        mockFormRequest(
          "/admin/settings/password",
          {
            csrf_token: csrfToken,
            current_password: TEST_ADMIN_PASSWORD,
            new_password: "newpassword1",
            new_password_confirm: "newpassword2",
          },
          cookie,
        ),
      );
      expect(res.status).toBe(400);
      const body = await res.text();
      expect(body).toContain("do not match");
    });

    it("rejects wrong current password", async () => {
      const res = await handle(
        mockFormRequest(
          "/admin/settings/password",
          {
            csrf_token: csrfToken,
            current_password: "wrongpassword",
            new_password: "newpassword1",
            new_password_confirm: "newpassword1",
          },
          cookie,
        ),
      );
      expect(res.status).toBe(400);
      const body = await res.text();
      expect(body).toContain("Invalid current password");
    });

    it("changes password and redirects with success message", async () => {
      const res = await handle(
        mockFormRequest(
          "/admin/settings/password",
          {
            csrf_token: csrfToken,
            current_password: TEST_ADMIN_PASSWORD,
            new_password: "newpassword123",
            new_password_confirm: "newpassword123",
          },
          cookie,
        ),
      );
      expect(res.status).toBe(302);
      const loc = res.headers.get("location") || "";
      expect(loc).toContain("success=");
      expect(loc).toContain("Password");
    });

    it("returns 500 when updateUserPassword returns false", async () => {
      const { settingsApi } = await import("#lib/db/settings.ts");
      const original = settingsApi.updateUserPassword;
      settingsApi.updateUserPassword = () => Promise.resolve(false);
      try {
        const res = await handle(
          mockFormRequest(
            "/admin/settings/password",
            {
              csrf_token: csrfToken,
              current_password: TEST_ADMIN_PASSWORD,
              new_password: "newpassword1",
              new_password_confirm: "newpassword1",
            },
            cookie,
          ),
        );
        expect(res.status).toBe(500);
        const body = await res.text();
        expect(body).toContain("Failed to change password");
      } finally {
        settingsApi.updateUserPassword = original;
      }
    });

    it("returns 500 when wrapped_data_key is corrupted", async () => {
      const { getDb } = await import("#lib/db/client.ts");
      const { getUserByUsername } = await import("#lib/db/users.ts");
      const user = await getUserByUsername(TEST_ADMIN_USERNAME);
      await getDb().execute({
        sql: "UPDATE users SET wrapped_data_key = ? WHERE id = ?",
        args: ["corrupted-key", user!.id],
      });
      const res = await handle(
        mockFormRequest(
          "/admin/settings/password",
          {
            csrf_token: csrfToken,
            current_password: TEST_ADMIN_PASSWORD,
            new_password: "newpassword1",
            new_password_confirm: "newpassword1",
          },
          cookie,
        ),
      );
      expect(res.status).toBe(500);
      const body = await res.text();
      expect(body).toContain("Failed to change password");
    });

    it("can log in with new password after change", async () => {
      // Change password
      await handle(
        mockFormRequest(
          "/admin/settings/password",
          {
            csrf_token: csrfToken,
            current_password: TEST_ADMIN_PASSWORD,
            new_password: "brandnewpass",
            new_password_confirm: "brandnewpass",
          },
          cookie,
        ),
      );

      // Login with new password
      const res = await handle(
        mockFormRequest("/admin/login", {
          username: TEST_ADMIN_USERNAME,
          password: "brandnewpass",
        }),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/admin");
    });
  });
});
