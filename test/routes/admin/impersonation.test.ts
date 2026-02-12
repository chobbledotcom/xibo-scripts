import { afterEach, beforeEach, describe, expect, it } from "#test-compat";
import { getAllActivityLog } from "#lib/db/activity-log.ts";
import { createSession } from "#lib/db/sessions.ts";
import {
  awaitTestRequest,
  createActivateAndLogin,
  createActivatedUser,
  createTestDbWithSetup,
  handle,
  loginAsAdmin,
  mockFormRequest,
  mockRequest,
  resetDb,
} from "#test-utils";

describe("admin impersonation", () => {
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

  describe("POST /admin/users/:id/impersonate", () => {
    it("creates impersonation session and sets both cookies", async () => {
      const targetId = await createActivatedUser("targetuser", "user", "userpass123");

      const response = await handle(
        mockFormRequest(
          `/admin/users/${targetId}/impersonate`,
          { csrf_token: csrfToken },
          cookie,
        ),
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");

      // Should have two set-cookie headers
      const cookies = response.headers.getSetCookie();
      const adminCookie = cookies.find((c) => c.startsWith("__Host-admin-session="));
      const sessionCookie = cookies.find((c) => c.startsWith("__Host-session="));
      expect(adminCookie).toBeDefined();
      expect(sessionCookie).toBeDefined();
    });

    it("logs impersonation activity", async () => {
      const targetId = await createActivatedUser("loguser", "user", "logpass123");

      await handle(
        mockFormRequest(
          `/admin/users/${targetId}/impersonate`,
          { csrf_token: csrfToken },
          cookie,
        ),
      );

      const logs = await getAllActivityLog();
      const log = logs.find((l) => l.message.includes("Impersonated"));
      expect(log).not.toBeNull();
      expect(log!.message).toContain("loguser");
    });

    it("cannot impersonate yourself", async () => {
      const response = await handle(
        mockFormRequest(
          "/admin/users/1/impersonate",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(400);
    });

    it("returns 404 for nonexistent user", async () => {
      const response = await handle(
        mockFormRequest(
          "/admin/users/999/impersonate",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(404);
    });

    it("cannot impersonate an owner", async () => {
      const ownerId = await createActivatedUser("otherowner", "owner", "ownerpass123");

      const response = await handle(
        mockFormRequest(
          `/admin/users/${ownerId}/impersonate`,
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(403);
    });

    it("manager can impersonate user-role users", async () => {
      const mgr = await createActivateAndLogin("mgr1", "manager", "mgrpass123");
      const targetId = await createActivatedUser("mgrTarget", "user", "targetpass123");

      const response = await handle(
        mockFormRequest(
          `/admin/users/${targetId}/impersonate`,
          { csrf_token: mgr.csrfToken },
          mgr.cookie,
        ),
      );
      expect(response.status).toBe(302);
    });

    it("manager cannot impersonate manager-role users", async () => {
      const mgr = await createActivateAndLogin("mgr2", "manager", "mgrpass123");
      const targetId = await createActivatedUser("othermgr", "manager", "mgrpass456");

      const response = await handle(
        mockFormRequest(
          `/admin/users/${targetId}/impersonate`,
          { csrf_token: mgr.csrfToken },
          mgr.cookie,
        ),
      );
      expect(response.status).toBe(403);
    });

    it("redirects when not authenticated", async () => {
      const response = await handle(
        mockFormRequest("/admin/users/2/impersonate", { csrf_token: "fake" }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    it("returns 500 when session lacks data key", async () => {
      const targetId = await createActivatedUser("nodk", "user", "pass123");

      // Create a session without wrapped_data_key
      await createSession("no-dk-token", "no-dk-csrf", Date.now() + 3600000, null, 1);

      const response = await handle(
        mockFormRequest(
          `/admin/users/${targetId}/impersonate`,
          { csrf_token: "no-dk-csrf" },
          "__Host-session=no-dk-token",
        ),
      );
      expect(response.status).toBe(500);
      const html = await response.text();
      expect(html).toContain("session lacks data key");
    });
  });

  describe("GET /admin/stop-impersonating", () => {
    it("restores admin session and redirects to users page", async () => {
      const targetId = await createActivatedUser("stopuser", "user", "stoppass123");

      // Start impersonation
      const impResponse = await handle(
        mockFormRequest(
          `/admin/users/${targetId}/impersonate`,
          { csrf_token: csrfToken },
          cookie,
        ),
      );

      // Extract cookies from impersonation response
      const impCookies = impResponse.headers.getSetCookie();
      const adminSessionCookie = impCookies.find((c) => c.startsWith("__Host-admin-session="))!;
      const newSessionCookie = impCookies.find((c) => c.startsWith("__Host-session="))!;

      const adminToken = adminSessionCookie.split("=")[1]!.split(";")[0]!;
      const sessionToken = newSessionCookie.split("=")[1]!.split(";")[0]!;

      // Now stop impersonating
      const stopResponse = await handle(
        new Request("http://localhost/admin/stop-impersonating", {
          headers: {
            host: "localhost",
            cookie: `__Host-session=${sessionToken}; __Host-admin-session=${adminToken}`,
          },
        }),
      );

      expect(stopResponse.status).toBe(302);
      expect(stopResponse.headers.get("location")).toBe("/admin/users");

      // Should restore session and clear admin cookie
      const stopCookies = stopResponse.headers.getSetCookie();
      const restoredSession = stopCookies.find((c) => c.startsWith("__Host-session="));
      const clearedAdmin = stopCookies.find((c) =>
        c.includes("__Host-admin-session=") && c.includes("Max-Age=0")
      );
      expect(restoredSession).toBeDefined();
      expect(clearedAdmin).toBeDefined();
    });

    it("redirects to /admin when not impersonating", async () => {
      const response = await handle(
        mockRequest("/admin/stop-impersonating"),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    it("clears cookies when admin session expired", async () => {
      // Create an expired admin session
      await createSession("expired-admin", "expired-csrf", Date.now() - 1000, null, 1);

      const response = await handle(
        new Request("http://localhost/admin/stop-impersonating", {
          headers: {
            host: "localhost",
            cookie: "__Host-session=some-token; __Host-admin-session=expired-admin",
          },
        }),
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });
  });

  describe("impersonation banner rendering", () => {
    it("shows impersonation banner when impersonating", async () => {
      const targetId = await createActivatedUser("banneruser", "user", "bannerpass123");

      // Start impersonation
      const impResponse = await handle(
        mockFormRequest(
          `/admin/users/${targetId}/impersonate`,
          { csrf_token: csrfToken },
          cookie,
        ),
      );

      // Extract cookies
      const impCookies = impResponse.headers.getSetCookie();
      const adminSessionCookie = impCookies.find((c) => c.startsWith("__Host-admin-session="))!;
      const newSessionCookie = impCookies.find((c) => c.startsWith("__Host-session="))!;

      const adminToken = adminSessionCookie.split("=")[1]!.split(";")[0]!;
      const sessionToken = newSessionCookie.split("=")[1]!.split(";")[0]!;

      // Visit dashboard as impersonated user
      const dashResponse = await handle(
        new Request("http://localhost/admin/", {
          headers: {
            host: "localhost",
            cookie: `__Host-session=${sessionToken}; __Host-admin-session=${adminToken}`,
          },
        }),
      );

      expect(dashResponse.status).toBe(200);
      const html = await dashResponse.text();
      expect(html).toContain("You are impersonating");
      expect(html).toContain("banneruser");
      expect(html).toContain("Stop Impersonating");
    });

    it("does not show impersonation banner when not impersonating", async () => {
      const response = await awaitTestRequest("/admin/", { cookie });
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).not.toContain("You are impersonating");
    });
  });

  describe("impersonate button on users page", () => {
    it("shows Impersonate button for active non-owner users", async () => {
      await createActivatedUser("impbutton", "user", "imppass123");

      const response = await awaitTestRequest("/admin/users", { cookie });
      const html = await response.text();
      expect(html).toContain("Impersonate");
    });

    it("does not show Impersonate button for owner users", async () => {
      // The only user is the owner — should not see impersonate for self
      const response = await awaitTestRequest("/admin/users", { cookie });
      const html = await response.text();
      // The owner row should NOT have an impersonate button
      // Check that the impersonate form action doesn't appear for user 1 (owner)
      expect(html).not.toContain("/admin/users/1/impersonate");
    });
  });

  describe("access control", () => {
    it("user role cannot access impersonation routes", async () => {
      const user = await createActivateAndLogin("noaccess", "user", "userpass123");
      const response = await handle(
        mockFormRequest(
          "/admin/users/1/impersonate",
          { csrf_token: user.csrfToken },
          user.cookie,
        ),
      );
      expect(response.status).toBe(403);
    });
  });
});
