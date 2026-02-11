/**
 * Tests for admin shared media routes
 *
 * These tests mock `globalThis.fetch` to intercept Xibo API calls.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "#test-compat";
import {
  createTestDbWithSetup,
  loginAsAdmin,
  mockFormRequest,
  mockRequest,
  resetDb,
} from "#test-utils";
import {
  invalidateSettingsCache,
  setSharedFolderId,
  updateXiboCredentials,
} from "#lib/db/settings.ts";
import { clearToken } from "#xibo/client.ts";
import { cacheInvalidateAll } from "#xibo/cache.ts";
import type { XiboMedia } from "#xibo/types.ts";

const XIBO_URL = "https://xibo.test";
const XIBO_CLIENT_ID = "test-client-id";
const XIBO_CLIENT_SECRET = "test-client-secret";
const SHARED_FOLDER_ID = 42;

const sharedMedia: XiboMedia[] = [
  {
    mediaId: 10,
    name: "logo.png",
    mediaType: "image",
    storedAs: "10.png",
    fileSize: 204800,
    duration: 10,
    tags: "",
    folderId: SHARED_FOLDER_ID,
  },
  {
    mediaId: 11,
    name: "banner.png",
    mediaType: "image",
    storedAs: "11.png",
    fileSize: 102400,
    duration: 10,
    tags: "",
    folderId: SHARED_FOLDER_ID,
  },
];

const otherMedia: XiboMedia[] = [
  {
    mediaId: 20,
    name: "biz-photo.jpg",
    mediaType: "image",
    storedAs: "20.jpg",
    fileSize: 512000,
    duration: 10,
    tags: "",
    folderId: 99,
  },
];

/** Original fetch for restore */
const originalFetch = globalThis.fetch;

const createMockFetch = (
  handlers: Record<
    string,
    (url: string, init?: RequestInit) => Response | Promise<Response>
  >,
): typeof globalThis.fetch =>
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;

    if (url.includes("/api/authorize/access_token")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: "test-token",
            token_type: "Bearer",
            expires_in: 3600,
          }),
          { headers: { "content-type": "application/json" } },
        ),
      );
    }

    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        return Promise.resolve(handler(url, init));
      }
    }

    return originalFetch(input, init);
  };

const jsonResponse = (data: unknown): Response =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });

const mockMultipartRequest = (
  path: string,
  formData: FormData,
  sessionCookie: string,
): Request =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { cookie: sessionCookie, host: "localhost" },
    body: formData,
  });

const allMediaHandler = (): Response =>
  jsonResponse([...sharedMedia, ...otherMedia]);

describe("shared media routes", () => {
  let cookie: string;
  let csrfToken: string;

  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
    await updateXiboCredentials(XIBO_URL, XIBO_CLIENT_ID, XIBO_CLIENT_SECRET);
    clearToken();
    await cacheInvalidateAll();

    const auth = await loginAsAdmin();
    cookie = auth.cookie;
    csrfToken = auth.csrfToken;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearToken();
    resetDb();
  });

  const handleRequest = async (request: Request): Promise<Response> => {
    const { handleRequest: handler } = await import("#routes");
    return handler(request);
  };

  const clearXiboConfig = async (): Promise<void> => {
    await updateXiboCredentials("", "", "");
    invalidateSettingsCache();
    await cacheInvalidateAll();
  };

  describe("GET /admin/media/shared", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handleRequest(
        mockRequest("/admin/media/shared"),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("redirects to settings when Xibo not configured", async () => {
      await clearXiboConfig();
      const response = await handleRequest(
        mockRequest("/admin/media/shared", { headers: { cookie } }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("/admin/settings");
    });

    test("shows message when shared folder not configured", async () => {
      globalThis.fetch = createMockFetch({});

      const response = await handleRequest(
        mockRequest("/admin/media/shared", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Shared folder not configured");
    });

    test("lists shared media when configured", async () => {
      await setSharedFolderId(SHARED_FOLDER_ID);
      invalidateSettingsCache();

      globalThis.fetch = createMockFetch({
        "/api/library": allMediaHandler,
      });

      const response = await handleRequest(
        mockRequest("/admin/media/shared", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("logo.png");
      expect(html).toContain("banner.png");
      expect(html).not.toContain("biz-photo.jpg");
    });

    test("shows success message from query param", async () => {
      await setSharedFolderId(SHARED_FOLDER_ID);
      invalidateSettingsCache();

      globalThis.fetch = createMockFetch({
        "/api/library": allMediaHandler,
      });

      const response = await handleRequest(
        mockRequest("/admin/media/shared?success=Photo+uploaded", {
          headers: { cookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Photo uploaded");
    });

    test("shows error when API fails", async () => {
      await setSharedFolderId(SHARED_FOLDER_ID);
      invalidateSettingsCache();

      globalThis.fetch = createMockFetch({
        "/api/library": () => new Response("Server Error", { status: 500 }),
      });

      const response = await handleRequest(
        mockRequest("/admin/media/shared", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Failed to load shared photos");
    });
  });

  describe("GET /admin/media/shared/upload", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handleRequest(
        mockRequest("/admin/media/shared/upload"),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("renders upload form", async () => {
      globalThis.fetch = createMockFetch({});

      const response = await handleRequest(
        mockRequest("/admin/media/shared/upload", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Upload Shared Photo");
      expect(html).toContain("PNG");
    });
  });

  describe("POST /admin/media/shared/upload", () => {
    test("redirects to login when not authenticated", async () => {
      const formData = new FormData();
      formData.append("csrf_token", "bad");
      const response = await handleRequest(
        mockMultipartRequest("/admin/media/shared/upload", formData, ""),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("redirects to settings when Xibo not configured", async () => {
      await clearXiboConfig();
      const formData = new FormData();
      formData.append("csrf_token", csrfToken);
      const response = await handleRequest(
        mockMultipartRequest("/admin/media/shared/upload", formData, cookie),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("/admin/settings");
    });

    test("returns 400 when shared folder not configured", async () => {
      globalThis.fetch = createMockFetch({});

      const formData = new FormData();
      formData.append("csrf_token", csrfToken);
      formData.append(
        "file",
        new File(["img"], "test.png", { type: "image/png" }),
      );

      const response = await handleRequest(
        mockMultipartRequest("/admin/media/shared/upload", formData, cookie),
      );
      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("Shared folder not configured");
    });

    test("returns 403 for invalid CSRF token", async () => {
      await setSharedFolderId(SHARED_FOLDER_ID);
      invalidateSettingsCache();

      globalThis.fetch = createMockFetch({});

      const formData = new FormData();
      formData.append("csrf_token", "wrong-token");
      formData.append(
        "file",
        new File(["img"], "test.png", { type: "image/png" }),
      );

      const response = await handleRequest(
        mockMultipartRequest("/admin/media/shared/upload", formData, cookie),
      );
      expect(response.status).toBe(403);
    });

    test("returns 400 when no file is provided", async () => {
      await setSharedFolderId(SHARED_FOLDER_ID);
      invalidateSettingsCache();

      globalThis.fetch = createMockFetch({});

      const formData = new FormData();
      formData.append("csrf_token", csrfToken);

      const response = await handleRequest(
        mockMultipartRequest("/admin/media/shared/upload", formData, cookie),
      );
      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("Please select a PNG file");
    });

    test("returns 400 for non-PNG file", async () => {
      await setSharedFolderId(SHARED_FOLDER_ID);
      invalidateSettingsCache();

      globalThis.fetch = createMockFetch({});

      const formData = new FormData();
      formData.append("csrf_token", csrfToken);
      formData.append(
        "file",
        new File(["img data"], "photo.jpg", { type: "image/jpeg" }),
      );

      const response = await handleRequest(
        mockMultipartRequest("/admin/media/shared/upload", formData, cookie),
      );
      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("Only PNG files are accepted");
    });

    test("uploads PNG file and redirects with success", async () => {
      await setSharedFolderId(SHARED_FOLDER_ID);
      invalidateSettingsCache();

      globalThis.fetch = createMockFetch({
        "/api/library": () =>
          jsonResponse({ mediaId: 99, name: "product.png" }),
      });

      const formData = new FormData();
      formData.append("csrf_token", csrfToken);
      formData.append(
        "file",
        new File(["PNG image data"], "product.png", { type: "image/png" }),
      );
      formData.append("name", "Product Logo");

      const response = await handleRequest(
        mockMultipartRequest("/admin/media/shared/upload", formData, cookie),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        "/admin/media/shared?success=",
      );
      expect(response.headers.get("location")).toContain("Product%20Logo");
    });

    test("uses filename without .png extension as name when name not provided", async () => {
      await setSharedFolderId(SHARED_FOLDER_ID);
      invalidateSettingsCache();

      globalThis.fetch = createMockFetch({
        "/api/library": () =>
          jsonResponse({ mediaId: 99, name: "my-product.png" }),
      });

      const formData = new FormData();
      formData.append("csrf_token", csrfToken);
      formData.append(
        "file",
        new File(["PNG image data"], "my-product.png", { type: "image/png" }),
      );

      const response = await handleRequest(
        mockMultipartRequest("/admin/media/shared/upload", formData, cookie),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("my-product");
    });

    test("shows error when upload to Xibo fails", async () => {
      await setSharedFolderId(SHARED_FOLDER_ID);
      invalidateSettingsCache();

      globalThis.fetch = createMockFetch({
        "/api/library": () =>
          new Response("Upload rejected", { status: 422 }),
      });

      const formData = new FormData();
      formData.append("csrf_token", csrfToken);
      formData.append(
        "file",
        new File(["PNG image data"], "test.png", { type: "image/png" }),
      );
      formData.append("name", "Test");

      const response = await handleRequest(
        mockMultipartRequest("/admin/media/shared/upload", formData, cookie),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Upload failed");
    });

    test("returns 400 for invalid form data", async () => {
      await setSharedFolderId(SHARED_FOLDER_ID);
      invalidateSettingsCache();

      globalThis.fetch = createMockFetch({});

      const response = await handleRequest(
        new Request("http://localhost/admin/media/shared/upload", {
          method: "POST",
          headers: {
            cookie,
            host: "localhost",
            "content-type": "multipart/form-data; boundary=----invalid",
          },
          body: "not valid multipart data",
        }),
      );
      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("Invalid form data");
    });
  });

  describe("POST /admin/media/shared/:id/delete", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handleRequest(
        mockFormRequest("/admin/media/shared/10/delete", {
          csrf_token: "bad",
        }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("redirects with error when shared folder not configured", async () => {
      // Don't set shared folder ID — it defaults to null
      invalidateSettingsCache();

      const response = await handleRequest(
        mockFormRequest(
          "/admin/media/shared/10/delete",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        "error=Shared%20folder%20not%20configured",
      );
    });

    test("deletes shared media and redirects with success", async () => {
      await setSharedFolderId(SHARED_FOLDER_ID);
      invalidateSettingsCache();

      globalThis.fetch = createMockFetch({
        "/api/library/10": (_url, init) => {
          if (init?.method === "DELETE") {
            return new Response(null, { status: 204 });
          }
          return jsonResponse(sharedMedia);
        },
        "/api/library": allMediaHandler,
      });

      const response = await handleRequest(
        mockFormRequest(
          "/admin/media/shared/10/delete",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        "/admin/media/shared?success=",
      );
    });

    test("rejects delete of media not in shared folder", async () => {
      await setSharedFolderId(SHARED_FOLDER_ID);
      invalidateSettingsCache();

      globalThis.fetch = createMockFetch({
        "/api/library": allMediaHandler,
      });

      const response = await handleRequest(
        mockFormRequest(
          "/admin/media/shared/20/delete",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        "error=",
      );
      expect(response.headers.get("location")).toContain(
        "not%20found%20in%20shared%20folder",
      );
    });

    test("redirects with error when delete fails", async () => {
      await setSharedFolderId(SHARED_FOLDER_ID);
      invalidateSettingsCache();

      globalThis.fetch = createMockFetch({
        "/api/library/10": (_url, init) => {
          if (init?.method === "DELETE") {
            return new Response("Server Error", { status: 500 });
          }
          return jsonResponse(sharedMedia);
        },
        "/api/library": allMediaHandler,
      });

      const response = await handleRequest(
        mockFormRequest(
          "/admin/media/shared/10/delete",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("error=");
    });

    test("returns 403 for invalid CSRF token", async () => {
      const response = await handleRequest(
        mockFormRequest(
          "/admin/media/shared/10/delete",
          { csrf_token: "wrong-token" },
          cookie,
        ),
      );
      expect(response.status).toBe(403);
    });

    test("redirects with error when library fetch fails during verification", async () => {
      await setSharedFolderId(SHARED_FOLDER_ID);
      invalidateSettingsCache();

      globalThis.fetch = createMockFetch({
        "/api/library": () => new Response("Error", { status: 500 }),
      });

      const response = await handleRequest(
        mockFormRequest(
          "/admin/media/shared/10/delete",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("error=");
    });
  });
});
