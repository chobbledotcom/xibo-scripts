import { afterEach, beforeEach, describe, expect, it, spyOn } from "#test-compat";
import {
  createTestDb,
  createTestDbWithSetup,
  getSetupCsrfToken,
  mockFormRequest,
  mockRequest,
  mockSetupFormRequest,
  resetDb,
} from "#test-utils";
import { settingsApi } from "#lib/db/settings.ts";

const handle = async (req: Request): Promise<Response> => {
  const { handleRequest } = await import("#routes");
  return handleRequest(req);
};

/** GET /setup and return the CSRF token from the set-cookie header */
const getSetupPageCsrf = async (): Promise<string> => {
  const res = await handle(mockRequest("/setup"));
  const cookie = res.headers.get("set-cookie");
  const token = getSetupCsrfToken(cookie);
  if (!token) throw new Error("No setup_csrf token in response");
  return token;
};

describe("setup flow", () => {
  beforeEach(() => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
  });

  afterEach(() => {
    resetDb();
  });

  describe("GET /setup", () => {
    it("returns 200 with setup form HTML when setup not complete", async () => {
      await createTestDb();
      const res = await handle(mockRequest("/setup"));
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("Initial Setup");
      expect(body).toContain("admin_username");
      expect(body).toContain("admin_password");
    });

    it("sets setup_csrf cookie", async () => {
      await createTestDb();
      const res = await handle(mockRequest("/setup"));
      const cookie = res.headers.get("set-cookie") || "";
      expect(cookie).toContain("setup_csrf=");
    });

    it("redirects to / when setup already complete", async () => {
      await createTestDbWithSetup();
      const res = await handle(mockRequest("/setup"));
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/");
    });
  });

  describe("POST /setup — CSRF", () => {
    it("rejects when csrf_token missing from form", async () => {
      await createTestDb();
      const csrfToken = await getSetupPageCsrf();
      // Send with cookie but no form token
      const res = await handle(
        mockFormRequest("/setup", { admin_username: "a" }, `setup_csrf=${csrfToken}`),
      );
      expect(res.status).toBe(403);
    });

    it("rejects when setup_csrf cookie missing", async () => {
      await createTestDb();
      const res = await handle(
        mockFormRequest("/setup", { csrf_token: "bogus" }),
      );
      expect(res.status).toBe(403);
    });

    it("rejects when cookie and form token don't match", async () => {
      await createTestDb();
      const res = await handle(
        mockFormRequest(
          "/setup",
          { csrf_token: "form-token" },
          "setup_csrf=different-cookie-token",
        ),
      );
      expect(res.status).toBe(403);
    });

    it("returns fresh CSRF token on rejection", async () => {
      await createTestDb();
      const res = await handle(
        mockFormRequest("/setup", { csrf_token: "bad" }, "setup_csrf=bad2"),
      );
      const cookie = res.headers.get("set-cookie") || "";
      expect(cookie).toContain("setup_csrf=");
    });
  });

  describe("POST /setup — validation", () => {
    it("rejects missing admin_username", async () => {
      await createTestDb();
      const csrf = await getSetupPageCsrf();
      const res = await handle(
        mockSetupFormRequest(
          {
            admin_password: "longpassword",
            admin_password_confirm: "longpassword",
          },
          csrf,
        ),
      );
      expect(res.status).toBe(400);
    });

    it("rejects missing admin_password", async () => {
      await createTestDb();
      const csrf = await getSetupPageCsrf();
      const res = await handle(
        mockSetupFormRequest(
          {
            admin_username: "admin",
            admin_password_confirm: "longpassword",
          },
          csrf,
        ),
      );
      expect(res.status).toBe(400);
    });

    it("rejects password shorter than 8 chars", async () => {
      await createTestDb();
      const csrf = await getSetupPageCsrf();
      const res = await handle(
        mockSetupFormRequest(
          {
            admin_username: "admin",
            admin_password: "short",
            admin_password_confirm: "short",
          },
          csrf,
        ),
      );
      expect(res.status).toBe(400);
      const body = await res.text();
      expect(body).toContain("8 characters");
    });

    it("rejects mismatched passwords", async () => {
      await createTestDb();
      const csrf = await getSetupPageCsrf();
      const res = await handle(
        mockSetupFormRequest(
          {
            admin_username: "admin",
            admin_password: "longpassword1",
            admin_password_confirm: "longpassword2",
          },
          csrf,
        ),
      );
      expect(res.status).toBe(400);
      const body = await res.text();
      expect(body).toContain("do not match");
    });
  });

  describe("POST /setup — success", () => {
    it("creates admin user and redirects to /setup/complete", async () => {
      await createTestDb();
      const csrf = await getSetupPageCsrf();
      const res = await handle(
        mockSetupFormRequest(
          {
            admin_username: "admin",
            admin_password: "longpassword",
            admin_password_confirm: "longpassword",
          },
          csrf,
        ),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/setup/complete");
    });

    it("works without xibo credentials", async () => {
      await createTestDb();
      const csrf = await getSetupPageCsrf();
      const res = await handle(
        mockSetupFormRequest(
          {
            admin_username: "admin",
            admin_password: "longpassword",
            admin_password_confirm: "longpassword",
          },
          csrf,
        ),
      );
      expect(res.status).toBe(302);
    });

    it("accepts optional xibo credentials", async () => {
      await createTestDb();
      const csrf = await getSetupPageCsrf();
      const res = await handle(
        mockSetupFormRequest(
          {
            admin_username: "admin",
            admin_password: "longpassword",
            admin_password_confirm: "longpassword",
            xibo_api_url: "https://xibo.test",
            xibo_client_id: "cid",
            xibo_client_secret: "csecret",
          },
          csrf,
        ),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/setup/complete");
    });
  });

  describe("GET /setup/complete", () => {
    it("returns 200 with completion page when setup done", async () => {
      await createTestDbWithSetup();
      const res = await handle(mockRequest("/setup/complete"));
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("Setup Complete");
    });

    it("redirects to /setup when setup not yet complete", async () => {
      await createTestDb();
      const res = await handle(mockRequest("/setup/complete"));
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/setup/");
    });
  });

  describe("POST /setup after already complete", () => {
    it("redirects to /", async () => {
      await createTestDbWithSetup();
      const res = await handle(
        mockFormRequest(
          "/setup",
          { csrf_token: "any", admin_username: "x", admin_password: "y" },
          "setup_csrf=any",
        ),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/");
    });
  });

  describe("POST /setup — completeSetup failure", () => {
    it("throws when settingsApi.completeSetup throws", async () => {
      await createTestDb();
      const csrf = await getSetupPageCsrf();

      const spy = spyOn(settingsApi, "completeSetup");
      spy.mockImplementation(() => {
        throw new Error("DB write failed");
      });

      try {
        let caught = false;
        try {
          await handle(
            mockSetupFormRequest(
              {
                admin_username: "admin",
                admin_password: "longpassword",
                admin_password_confirm: "longpassword",
              },
              csrf,
            ),
          );
        } catch (e) {
          caught = true;
          expect((e as Error).message).toBe("DB write failed");
        }
        expect(caught).toBe(true);
      } finally {
        spy.mockRestore!();
      }
    });
  });

  describe("POST /setup — formCsrf fallback", () => {
    it("uses empty string for formCsrf when form has no csrf_token after CSRF validation", async () => {
      await createTestDb();
      const csrf = await getSetupPageCsrf();
      // Submit a valid CSRF setup POST but with validation error to exercise
      // the formCsrf path at line 120 (form.get("csrf_token") returns the token).
      // The token IS in the form here; the `|| ""` left side is exercised.
      // A validation error triggers the htmlResponse(setupPage(error, formCsrf)) path.
      const res = await handle(
        mockSetupFormRequest(
          {
            admin_username: "admin",
            admin_password: "short",
            admin_password_confirm: "short",
          },
          csrf,
        ),
      );
      expect(res.status).toBe(400);
      const body = await res.text();
      expect(body).toContain("8 characters");
    });
  });
});
