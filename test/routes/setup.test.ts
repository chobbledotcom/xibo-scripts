import { afterEach, describe, expect, test } from "#test-compat";
import {
  createTestDb,
  createTestDbWithSetup,
  getSetupCsrfToken,
  mockFormRequest,
  mockRequest,
  mockSetupFormRequest,
  resetDb,
} from "#test-utils";

describe("setup flow", () => {
  afterEach(() => {
    resetDb();
  });

  const handleRequest = async (request: Request): Promise<Response> => {
    const { handleRequest: handler } = await import("#routes");
    return handler(request);
  };

  /** GET /setup and extract CSRF token from set-cookie */
  const getSetupCsrf = async (): Promise<string> => {
    const response = await handleRequest(mockRequest("/setup"));
    const setCookie = response.headers.get("set-cookie");
    const token = getSetupCsrfToken(setCookie);
    if (!token) throw new Error("No setup CSRF token found");
    return token;
  };

  describe("GET /setup", () => {
    test("returns 200 with setup form HTML when setup not complete", async () => {
      await createTestDb();
      const response = await handleRequest(mockRequest("/setup"));
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Initial Setup");
      expect(html).toContain("Complete Setup");
    });

    test("sets setup_csrf cookie", async () => {
      await createTestDb();
      const response = await handleRequest(mockRequest("/setup"));
      const setCookie = response.headers.get("set-cookie") || "";
      expect(setCookie).toContain("setup_csrf=");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Strict");
    });

    test("redirects to / when setup already complete", async () => {
      await createTestDbWithSetup();
      const response = await handleRequest(mockRequest("/setup"));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/");
    });
  });

  describe("POST /setup — CSRF", () => {
    test("rejects when csrf_token missing from form", async () => {
      await createTestDb();
      const csrfToken = await getSetupCsrf();
      const response = await handleRequest(
        mockFormRequest(
          "/setup",
          { admin_username: "admin", admin_password: "password123" },
          `setup_csrf=${csrfToken}`,
        ),
      );
      expect(response.status).toBe(403);
    });

    test("rejects when setup_csrf cookie missing", async () => {
      await createTestDb();
      const response = await handleRequest(
        mockFormRequest("/setup", {
          csrf_token: "some-token",
          admin_username: "admin",
          admin_password: "password123",
        }),
      );
      expect(response.status).toBe(403);
    });

    test("rejects when cookie and form token don't match", async () => {
      await createTestDb();
      const response = await handleRequest(
        mockFormRequest(
          "/setup",
          { csrf_token: "mismatched-token", admin_username: "admin" },
          "setup_csrf=different-token",
        ),
      );
      expect(response.status).toBe(403);
    });

    test("returns fresh CSRF token on rejection", async () => {
      await createTestDb();
      const response = await handleRequest(
        mockFormRequest(
          "/setup",
          { csrf_token: "bad" },
          "setup_csrf=wrong",
        ),
      );
      expect(response.status).toBe(403);
      const setCookie = response.headers.get("set-cookie") || "";
      expect(setCookie).toContain("setup_csrf=");
    });
  });

  describe("POST /setup — validation", () => {
    test("rejects missing admin_username", async () => {
      await createTestDb();
      const csrfToken = await getSetupCsrf();
      const response = await handleRequest(
        mockSetupFormRequest(
          {
            admin_username: "",
            admin_password: "password123",
            admin_password_confirm: "password123",
          },
          csrfToken,
        ),
      );
      expect(response.status).toBe(400);
    });

    test("rejects missing admin_password", async () => {
      await createTestDb();
      const csrfToken = await getSetupCsrf();
      const response = await handleRequest(
        mockSetupFormRequest(
          {
            admin_username: "admin",
            admin_password: "",
            admin_password_confirm: "",
          },
          csrfToken,
        ),
      );
      expect(response.status).toBe(400);
    });

    test("rejects password shorter than 8 chars", async () => {
      await createTestDb();
      const csrfToken = await getSetupCsrf();
      const response = await handleRequest(
        mockSetupFormRequest(
          {
            admin_username: "admin",
            admin_password: "short",
            admin_password_confirm: "short",
          },
          csrfToken,
        ),
      );
      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("8 characters");
    });

    test("rejects mismatched passwords", async () => {
      await createTestDb();
      const csrfToken = await getSetupCsrf();
      const response = await handleRequest(
        mockSetupFormRequest(
          {
            admin_username: "admin",
            admin_password: "password123",
            admin_password_confirm: "different123",
          },
          csrfToken,
        ),
      );
      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("do not match");
    });
  });

  describe("POST /setup — success", () => {
    test("creates admin user and redirects to /setup/complete", async () => {
      await createTestDb();
      const csrfToken = await getSetupCsrf();
      const response = await handleRequest(
        mockSetupFormRequest(
          {
            admin_username: "myadmin",
            admin_password: "securepassword123",
            admin_password_confirm: "securepassword123",
          },
          csrfToken,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/setup/complete");
    });

    test("accepts optional xibo credentials", async () => {
      await createTestDb();
      const csrfToken = await getSetupCsrf();
      const response = await handleRequest(
        mockSetupFormRequest(
          {
            admin_username: "myadmin",
            admin_password: "securepassword123",
            admin_password_confirm: "securepassword123",
            xibo_api_url: "https://xibo.example.com",
            xibo_client_id: "test-id",
            xibo_client_secret: "test-secret",
          },
          csrfToken,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/setup/complete");
    });

    test("works without xibo credentials", async () => {
      await createTestDb();
      const csrfToken = await getSetupCsrf();
      const response = await handleRequest(
        mockSetupFormRequest(
          {
            admin_username: "myadmin",
            admin_password: "securepassword123",
            admin_password_confirm: "securepassword123",
          },
          csrfToken,
        ),
      );
      expect(response.status).toBe(302);
    });
  });

  describe("GET /setup/complete", () => {
    test("returns 200 with completion page when setup done", async () => {
      await createTestDbWithSetup();
      const response = await handleRequest(mockRequest("/setup/complete"));
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Setup Complete");
    });

    test("redirects to /setup when setup not yet complete", async () => {
      await createTestDb();
      const response = await handleRequest(mockRequest("/setup/complete"));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/setup/");
    });
  });

  describe("POST /setup after already complete", () => {
    test("redirects to /", async () => {
      await createTestDbWithSetup();
      const response = await handleRequest(
        mockFormRequest(
          "/setup",
          { csrf_token: "x", admin_username: "a", admin_password: "b" },
          "setup_csrf=x",
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/");
    });
  });
});
