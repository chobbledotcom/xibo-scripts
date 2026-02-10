/**
 * Tests for media admin routes
 *
 * These tests mock `globalThis.fetch` to intercept Xibo API calls,
 * since ES module exports are read-only in Deno and cannot be spied on.
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
  updateXiboCredentials,
} from "#lib/db/settings.ts";
import { clearToken } from "#xibo/client.ts";
import { cacheInvalidateAll } from "#xibo/cache.ts";
import type { XiboMedia } from "#xibo/types.ts";

const XIBO_URL = "https://xibo.test";
const XIBO_CLIENT_ID = "test-client-id";
const XIBO_CLIENT_SECRET = "test-client-secret";

const sampleMedia: XiboMedia[] = [
  {
    mediaId: 1,
    name: "photo.jpg",
    mediaType: "image",
    storedAs: "1.jpg",
    fileSize: 1048576,
    duration: 10,
    tags: "hero",
    folderId: 1,
  },
  {
    mediaId: 2,
    name: "clip.mp4",
    mediaType: "video",
    storedAs: "2.mp4",
    fileSize: 5242880,
    duration: 30,
    tags: "",
    folderId: 2,
  },
];

const sampleFolders = [
  { folderId: 1, text: "Images", parentId: null, children: [] },
  { folderId: 2, text: "Videos", parentId: null, children: [] },
];

/** Original fetch for restore */
const originalFetch = globalThis.fetch;

/**
 * Create a mock fetch that intercepts Xibo API calls.
 * Non-Xibo requests pass through to the original.
 */
const createMockFetch = (
  handlers: Record<
    string,
    (url: string, init?: RequestInit) => Response | Promise<Response>
  >,
): typeof globalThis.fetch => {
  return (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;

    // Handle Xibo OAuth token request
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

    // Check registered handlers for API endpoints
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        return Promise.resolve(handler(url, init));
      }
    }

    // Pass through non-Xibo requests
    return originalFetch(input, init);
  };
};

/** JSON response helper */
const jsonResponse = (data: unknown): Response =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });

/** Create a multipart form request for file upload */
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

/** Standard folders mock handler */
const foldersHandler = (): Response => jsonResponse(sampleFolders);

/** Empty folders mock handler */
const emptyFoldersHandler = (): Response => jsonResponse([]);

/** Standard library mock handler */
const libraryHandler = (): Response => jsonResponse(sampleMedia);

describe("media routes", () => {
  let cookie: string;
  let csrfToken: string;

  beforeEach(async () => {
    await createTestDbWithSetup();
    // Set up Xibo credentials in the database
    await updateXiboCredentials(XIBO_URL, XIBO_CLIENT_ID, XIBO_CLIENT_SECRET);
    clearToken();
    await cacheInvalidateAll();

    const auth = await loginAsAdmin();
    cookie = auth.cookie;
    csrfToken = auth.csrfToken;
  });

  afterEach(() => {
    // Restore original fetch
    globalThis.fetch = originalFetch;
    clearToken();
    resetDb();
  });

  const handleRequest = async (request: Request): Promise<Response> => {
    const { handleRequest: handler } = await import("#routes");
    return handler(request);
  };

  /** Clear Xibo credentials so loadXiboConfig returns null */
  const clearXiboConfig = async (): Promise<void> => {
    await updateXiboCredentials("", "", "");
    invalidateSettingsCache();
    await cacheInvalidateAll();
  };

  describe("GET /admin/media", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handleRequest(mockRequest("/admin/media"));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("redirects to settings when Xibo not configured", async () => {
      await clearXiboConfig();

      const response = await handleRequest(
        mockRequest("/admin/media", { headers: { cookie } }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("/admin/settings");
    });

    test("renders media list page with data", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": libraryHandler,
        "/api/folders": foldersHandler,
      });

      const response = await handleRequest(
        mockRequest("/admin/media", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Media Library");
      expect(html).toContain("photo.jpg");
      expect(html).toContain("clip.mp4");
    });

    test("renders empty media list", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": () => jsonResponse([]),
        "/api/folders": emptyFoldersHandler,
      });

      const response = await handleRequest(
        mockRequest("/admin/media", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("No media found");
    });

    test("shows error when API fails", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": () => new Response("Server Error", { status: 500 }),
        "/api/folders": emptyFoldersHandler,
      });

      const response = await handleRequest(
        mockRequest("/admin/media", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Failed to load media");
    });

    test("renders with success query param", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": () => jsonResponse([]),
        "/api/folders": emptyFoldersHandler,
      });

      const response = await handleRequest(
        mockRequest("/admin/media?success=File+uploaded", {
          headers: { cookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("File uploaded");
    });

    test("renders with error query param", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": () => jsonResponse([]),
        "/api/folders": emptyFoldersHandler,
      });

      const response = await handleRequest(
        mockRequest("/admin/media?error=Something+went+wrong", {
          headers: { cookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Something went wrong");
    });

    test("filters media by folder and type via query params", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": libraryHandler,
        "/api/folders": foldersHandler,
      });

      const response = await handleRequest(
        mockRequest("/admin/media?folderId=1&type=image", {
          headers: { cookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("photo.jpg");
      expect(html).not.toContain("clip.mp4");
    });
  });

  describe("GET /admin/media/upload", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handleRequest(
        mockRequest("/admin/media/upload"),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("redirects to settings when Xibo not configured", async () => {
      await clearXiboConfig();

      const response = await handleRequest(
        mockRequest("/admin/media/upload", { headers: { cookie } }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("/admin/settings");
    });

    test("renders upload form", async () => {
      globalThis.fetch = createMockFetch({
        "/api/folders": foldersHandler,
      });

      const response = await handleRequest(
        mockRequest("/admin/media/upload", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Upload Media");
      expect(html).toContain('type="file"');
      expect(html).toContain("Upload from URL");
    });

    test("renders upload form with empty folders on folder fetch error", async () => {
      globalThis.fetch = createMockFetch({
        "/api/folders": () => new Response("Error", { status: 500 }),
      });

      const response = await handleRequest(
        mockRequest("/admin/media/upload", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Upload Media");
    });
  });

  describe("POST /admin/media/upload", () => {
    test("redirects to login when not authenticated", async () => {
      const formData = new FormData();
      formData.append("csrf_token", "bad");
      const response = await handleRequest(
        mockMultipartRequest("/admin/media/upload", formData, ""),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("redirects to settings when Xibo not configured", async () => {
      await clearXiboConfig();

      const formData = new FormData();
      formData.append("csrf_token", csrfToken);
      const response = await handleRequest(
        mockMultipartRequest("/admin/media/upload", formData, cookie),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("/admin/settings");
    });

    test("returns 403 for invalid CSRF token", async () => {
      globalThis.fetch = createMockFetch({
        "/api/folders": emptyFoldersHandler,
      });

      const formData = new FormData();
      formData.append("csrf_token", "wrong-token");
      formData.append(
        "file",
        new File(["content"], "test.jpg", { type: "image/jpeg" }),
      );

      const response = await handleRequest(
        mockMultipartRequest("/admin/media/upload", formData, cookie),
      );
      expect(response.status).toBe(403);
    });

    test("returns 400 when no file is provided", async () => {
      globalThis.fetch = createMockFetch({
        "/api/folders": emptyFoldersHandler,
      });

      const formData = new FormData();
      formData.append("csrf_token", csrfToken);

      const response = await handleRequest(
        mockMultipartRequest("/admin/media/upload", formData, cookie),
      );
      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("Please select a file to upload");
    });

    test("returns 400 when file is empty", async () => {
      globalThis.fetch = createMockFetch({
        "/api/folders": emptyFoldersHandler,
      });

      const formData = new FormData();
      formData.append("csrf_token", csrfToken);
      formData.append(
        "file",
        new File([], "empty.jpg", { type: "image/jpeg" }),
      );

      const response = await handleRequest(
        mockMultipartRequest("/admin/media/upload", formData, cookie),
      );
      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("Please select a file to upload");
    });

    test("uploads file and redirects with success", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": () => jsonResponse({ mediaId: 10, name: "test.jpg" }),
        "/api/folders": emptyFoldersHandler,
      });

      const formData = new FormData();
      formData.append("csrf_token", csrfToken);
      formData.append(
        "file",
        new File(["image data"], "test.jpg", { type: "image/jpeg" }),
      );
      formData.append("name", "My Image");
      formData.append("folderId", "1");

      const response = await handleRequest(
        mockMultipartRequest("/admin/media/upload", formData, cookie),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        "/admin/media?success=",
      );
      expect(response.headers.get("location")).toContain("My%20Image");
    });

    test("uses filename as name when name is not provided", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": () => jsonResponse({ mediaId: 10, name: "test.jpg" }),
        "/api/folders": emptyFoldersHandler,
      });

      const formData = new FormData();
      formData.append("csrf_token", csrfToken);
      formData.append(
        "file",
        new File(["image data"], "photo.png", { type: "image/png" }),
      );

      const response = await handleRequest(
        mockMultipartRequest("/admin/media/upload", formData, cookie),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("photo.png");
    });

    test("shows error when upload to Xibo fails", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": () =>
          new Response("Upload rejected", { status: 422 }),
        "/api/folders": emptyFoldersHandler,
      });

      const formData = new FormData();
      formData.append("csrf_token", csrfToken);
      formData.append(
        "file",
        new File(["image data"], "test.jpg", { type: "image/jpeg" }),
      );
      formData.append("name", "Test");

      const response = await handleRequest(
        mockMultipartRequest("/admin/media/upload", formData, cookie),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Upload failed");
    });

    test("returns 400 for invalid form data", async () => {
      globalThis.fetch = createMockFetch({
        "/api/folders": emptyFoldersHandler,
      });

      const response = await handleRequest(
        new Request("http://localhost/admin/media/upload", {
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

  describe("POST /admin/media/upload-url", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handleRequest(
        mockFormRequest("/admin/media/upload-url", { csrf_token: "bad" }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("redirects to settings when Xibo not configured", async () => {
      await clearXiboConfig();

      const response = await handleRequest(
        mockFormRequest(
          "/admin/media/upload-url",
          {
            csrf_token: csrfToken,
            url: "https://example.com/image.jpg",
            name: "test",
          },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("/admin/settings");
    });

    test("returns 400 when URL is missing", async () => {
      globalThis.fetch = createMockFetch({
        "/api/folders": emptyFoldersHandler,
      });

      const response = await handleRequest(
        mockFormRequest(
          "/admin/media/upload-url",
          { csrf_token: csrfToken, url: "", name: "test" },
          cookie,
        ),
      );
      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("URL is required");
    });

    test("returns 400 when name is missing", async () => {
      globalThis.fetch = createMockFetch({
        "/api/folders": emptyFoldersHandler,
      });

      const response = await handleRequest(
        mockFormRequest(
          "/admin/media/upload-url",
          {
            csrf_token: csrfToken,
            url: "https://example.com/image.jpg",
            name: "",
          },
          cookie,
        ),
      );
      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("Name is required");
    });

    test("downloads from URL and uploads to Xibo", async () => {
      globalThis.fetch = createMockFetch({
        "example.com/photo.jpg": () =>
          new Response("fake image data", {
            headers: { "content-type": "image/jpeg" },
          }),
        "/api/library": () => jsonResponse({ mediaId: 10, name: "My Photo" }),
        "/api/folders": emptyFoldersHandler,
      });

      const response = await handleRequest(
        mockFormRequest(
          "/admin/media/upload-url",
          {
            csrf_token: csrfToken,
            url: "https://example.com/photo.jpg",
            name: "My Photo",
            folderId: "1",
          },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        "/admin/media?success=",
      );
      expect(response.headers.get("location")).toContain("My%20Photo");
    });

    test("shows error when download from URL fails", async () => {
      globalThis.fetch = createMockFetch({
        "example.com/broken.jpg": () => {
          throw new Error("Network error");
        },
        "/api/folders": emptyFoldersHandler,
      });

      const response = await handleRequest(
        mockFormRequest(
          "/admin/media/upload-url",
          {
            csrf_token: csrfToken,
            url: "https://example.com/broken.jpg",
            name: "Broken",
          },
          cookie,
        ),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Failed to download");
    });

    test("shows error when URL returns non-OK response", async () => {
      globalThis.fetch = createMockFetch({
        "example.com/missing.jpg": () =>
          new Response("Not Found", { status: 404 }),
        "/api/folders": emptyFoldersHandler,
      });

      const response = await handleRequest(
        mockFormRequest(
          "/admin/media/upload-url",
          {
            csrf_token: csrfToken,
            url: "https://example.com/missing.jpg",
            name: "Missing",
          },
          cookie,
        ),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Download failed");
      expect(html).toContain("404");
    });

    test("shows error when upload to Xibo fails after download", async () => {
      globalThis.fetch = createMockFetch({
        "example.com/image.png": () =>
          new Response("fake image", {
            headers: { "content-type": "image/png" },
          }),
        "/api/library": () =>
          new Response("Server Error", { status: 500 }),
        "/api/folders": emptyFoldersHandler,
      });

      const response = await handleRequest(
        mockFormRequest(
          "/admin/media/upload-url",
          {
            csrf_token: csrfToken,
            url: "https://example.com/image.png",
            name: "Fail Upload",
          },
          cookie,
        ),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Upload failed");
    });
  });

  describe("GET /admin/media/:id", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handleRequest(mockRequest("/admin/media/1"));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("redirects to settings when Xibo not configured", async () => {
      await clearXiboConfig();

      const response = await handleRequest(
        mockRequest("/admin/media/1", { headers: { cookie } }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("/admin/settings");
    });

    test("renders media detail page", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": libraryHandler,
      });

      const response = await handleRequest(
        mockRequest("/admin/media/1", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("photo.jpg");
      expect(html).toContain("Image");
      expect(html).toContain("1.0 MB");
    });

    test("returns 404 for non-existent media", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": libraryHandler,
      });

      const response = await handleRequest(
        mockRequest("/admin/media/999", { headers: { cookie } }),
      );
      expect(response.status).toBe(404);
    });
  });

  describe("GET /admin/media/:id/preview", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handleRequest(
        mockRequest("/admin/media/1/preview"),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("proxies image from Xibo API", async () => {
      const imageData = new Uint8Array([137, 80, 78, 71]);
      globalThis.fetch = createMockFetch({
        "/api/library/download/1": () =>
          new Response(imageData, {
            headers: { "content-type": "image/png" },
          }),
      });

      const response = await handleRequest(
        mockRequest("/admin/media/1/preview", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("cache-control")).toContain("max-age=300");
    });

    test("uses default content type when none provided", async () => {
      const imageData = new Uint8Array([0, 1, 2, 3]);
      globalThis.fetch = createMockFetch({
        "/api/library/download/1": () => new Response(imageData),
      });

      const response = await handleRequest(
        mockRequest("/admin/media/1/preview", { headers: { cookie } }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "application/octet-stream",
      );
    });

    test("returns 500 when preview fails", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library/download/1": () =>
          new Response("Not Found", { status: 404 }),
      });

      const response = await handleRequest(
        mockRequest("/admin/media/1/preview", { headers: { cookie } }),
      );
      expect(response.status).toBe(500);
    });
  });

  describe("POST /admin/media/:id/delete", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handleRequest(
        mockFormRequest("/admin/media/1/delete", { csrf_token: "bad" }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("deletes media and redirects with success", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library/1": () => new Response(null, { status: 204 }),
      });

      const response = await handleRequest(
        mockFormRequest(
          "/admin/media/1/delete",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        "/admin/media?success=",
      );
    });

    test("redirects with error when delete fails", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library/1": () =>
          new Response("Server Error", { status: 500 }),
      });

      const response = await handleRequest(
        mockFormRequest(
          "/admin/media/1/delete",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        "/admin/media?error=",
      );
    });

    test("returns 403 for invalid CSRF token", async () => {
      const response = await handleRequest(
        mockFormRequest(
          "/admin/media/1/delete",
          { csrf_token: "wrong-token" },
          cookie,
        ),
      );
      expect(response.status).toBe(403);
    });
  });
});
