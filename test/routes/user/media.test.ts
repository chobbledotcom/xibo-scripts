/**
 * Tests for user media routes (/dashboard/media)
 *
 * Tests media isolation: users see shared photos (read-only) and own business photos (editable).
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "#test-compat";
import {
  assignUserToBusiness,
  createBusiness,
  updateBusinessXiboIds,
} from "#lib/db/businesses.ts";
import {
  activateUser,
  createInvitedUser,
  hashInviteCode,
  setUserPassword,
} from "#lib/db/users.ts";
import type { AdminLevel } from "#lib/types.ts";
import {
  CONFIG_KEYS,
  invalidateSettingsCache,
  setSharedFolderId,
  setSetting,
  updateXiboCredentials,
} from "#lib/db/settings.ts";
import { clearToken } from "#xibo/client.ts";
import { cacheInvalidateAll } from "#xibo/cache.ts";
import type { XiboMedia } from "#xibo/types.ts";
import {
  createTestDbWithSetup,
  getCsrfTokenFromCookie,
  mockFormRequest,
  mockRequest,
  resetDb,
} from "#test-utils";

const XIBO_URL = "https://xibo.test";
const XIBO_CLIENT_ID = "test-client-id";
const XIBO_CLIENT_SECRET = "test-client-secret";

const SHARED_FOLDER_ID = 42;
const BUSINESS_FOLDER_ID = 100;
const OTHER_BUSINESS_FOLDER_ID = 200;

const sharedMedia: XiboMedia[] = [
  {
    mediaId: 1,
    name: "shared-logo.png",
    mediaType: "image",
    storedAs: "1.png",
    fileSize: 102400,
    duration: 10,
    tags: "",
    folderId: SHARED_FOLDER_ID,
  },
];

const businessMedia: XiboMedia[] = [
  {
    mediaId: 10,
    name: "my-photo.jpg",
    mediaType: "image",
    storedAs: "10.jpg",
    fileSize: 204800,
    duration: 10,
    tags: "",
    folderId: BUSINESS_FOLDER_ID,
  },
];

const otherBusinessMedia: XiboMedia[] = [
  {
    mediaId: 20,
    name: "other-biz.jpg",
    mediaType: "image",
    storedAs: "20.jpg",
    fileSize: 307200,
    duration: 10,
    tags: "",
    folderId: OTHER_BUSINESS_FOLDER_ID,
  },
];

const allMedia = [...sharedMedia, ...businessMedia, ...otherBusinessMedia];

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

const allMediaHandler = (): Response => jsonResponse(allMedia);

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

const handle = async (req: Request): Promise<Response> => {
  const { handleRequest } = await import("#routes");
  return handleRequest(req);
};

/** Create a user with a given role, activate, log in, and return cookie + csrf */
const createActivateAndLogin = async (
  username: string,
  role: AdminLevel,
  password: string,
): Promise<{ cookie: string; csrfToken: string; userId: number }> => {
  const codeHash = await hashInviteCode(`${username}-code`);
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
  const cookie = loginRes.headers.get("set-cookie") || "";
  const csrfToken = (await getCsrfTokenFromCookie(cookie))!;
  return { cookie, csrfToken, userId: user.id };
};

describe("user media routes", () => {
  let userCookie: string;
  let userCsrfToken: string;
  let userId: number;
  let businessId: number;

  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
    await updateXiboCredentials(XIBO_URL, XIBO_CLIENT_ID, XIBO_CLIENT_SECRET);
    await setSharedFolderId(SHARED_FOLDER_ID);
    clearToken();
    await cacheInvalidateAll();

    // Create a business with Xibo folder
    const biz = await createBusiness("Test Business");
    businessId = biz.id;
    await updateBusinessXiboIds(
      businessId,
      BUSINESS_FOLDER_ID,
      "test-biz-abc123",
      500,
    );

    // Create a user and assign to business
    const user = await createActivateAndLogin("testuser", "user", "userpass123");
    userCookie = user.cookie;
    userCsrfToken = user.csrfToken;
    userId = user.userId;
    await assignUserToBusiness(businessId, userId);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearToken();
    resetDb();
  });

  describe("GET /dashboard/media", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handle(mockRequest("/dashboard/media"));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("returns 403 when user has no businesses", async () => {
      // Create user without business assignment
      const noBusinessUser = await createActivateAndLogin(
        "nobiz",
        "user",
        "userpass123",
      );

      globalThis.fetch = createMockFetch({});

      const response = await handle(
        mockRequest("/dashboard/media", {
          headers: { cookie: noBusinessUser.cookie },
        }),
      );
      expect(response.status).toBe(403);
      const html = await response.text();
      expect(html).toContain("No Business Assigned");
    });

    test("shows shared and business media", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": allMediaHandler,
      });

      const response = await handle(
        mockRequest("/dashboard/media", {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("shared-logo.png");
      expect(html).toContain("my-photo.jpg");
      expect(html).not.toContain("other-biz.jpg");
    });

    test("shows only shared section when business has no folder", async () => {
      // Create business without Xibo folder
      const biz2 = await createBusiness("No Folder Biz");
      const user2 = await createActivateAndLogin(
        "nofolder",
        "user",
        "userpass123",
      );
      await assignUserToBusiness(biz2.id, user2.userId);

      globalThis.fetch = createMockFetch({
        "/api/library": allMediaHandler,
      });

      const response = await handle(
        mockRequest("/dashboard/media", {
          headers: { cookie: user2.cookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("shared-logo.png");
      expect(html).toContain("No photos uploaded yet");
    });

    test("hides shared section when shared folder not configured", async () => {
      await setSetting(CONFIG_KEYS.SHARED_FOLDER_ID, "");
      invalidateSettingsCache();

      globalThis.fetch = createMockFetch({
        "/api/library": allMediaHandler,
      });

      const response = await handle(
        mockRequest("/dashboard/media", {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).not.toContain("shared-logo.png");
      expect(html).toContain("my-photo.jpg");
    });

    test("shows success message from query param", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": () => jsonResponse([]),
      });

      const response = await handle(
        mockRequest("/dashboard/media?success=Photo+uploaded", {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Photo uploaded");
    });

    test("shows error when API fails", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": () => new Response("Server Error", { status: 500 }),
      });

      const response = await handle(
        mockRequest("/dashboard/media", {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Failed to load media");
    });

    test("supports business switcher for multi-business users", async () => {
      // Create second business
      const biz2 = await createBusiness("Second Business");
      await updateBusinessXiboIds(
        biz2.id,
        OTHER_BUSINESS_FOLDER_ID,
        "second-biz-xyz789",
        501,
      );
      await assignUserToBusiness(biz2.id, userId);

      globalThis.fetch = createMockFetch({
        "/api/library": allMediaHandler,
      });

      // Default to first business
      const response1 = await handle(
        mockRequest("/dashboard/media", {
          headers: { cookie: userCookie },
        }),
      );
      expect(response1.status).toBe(200);
      const html1 = await response1.text();
      expect(html1).toContain("my-photo.jpg");
      expect(html1).not.toContain("other-biz.jpg");

      // Switch to second business
      const response2 = await handle(
        mockRequest(`/dashboard/media?businessId=${biz2.id}`, {
          headers: { cookie: userCookie },
        }),
      );
      expect(response2.status).toBe(200);
      const html2 = await response2.text();
      expect(html2).toContain("other-biz.jpg");
      expect(html2).not.toContain("my-photo.jpg");
    });
  });

  describe("GET /dashboard/media/upload", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handle(mockRequest("/dashboard/media/upload"));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("renders upload form for authenticated user", async () => {
      globalThis.fetch = createMockFetch({});

      const response = await handle(
        mockRequest("/dashboard/media/upload", {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Upload Photo");
      expect(html).toContain('type="file"');
    });
  });

  describe("POST /dashboard/media/upload", () => {
    test("redirects to login when not authenticated", async () => {
      const formData = new FormData();
      formData.append("csrf_token", "bad");
      const response = await handle(
        mockMultipartRequest("/dashboard/media/upload", formData, ""),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("returns 403 when user has no businesses", async () => {
      const noBusinessUser = await createActivateAndLogin(
        "nobiz2",
        "user",
        "userpass123",
      );

      globalThis.fetch = createMockFetch({});

      const formData = new FormData();
      formData.append("csrf_token", noBusinessUser.csrfToken);
      formData.append(
        "file",
        new File(["img"], "test.jpg", { type: "image/jpeg" }),
      );

      const response = await handle(
        mockMultipartRequest(
          "/dashboard/media/upload",
          formData,
          noBusinessUser.cookie,
        ),
      );
      expect(response.status).toBe(403);
    });

    test("returns 403 for invalid CSRF token", async () => {
      globalThis.fetch = createMockFetch({});

      const formData = new FormData();
      formData.append("csrf_token", "wrong-token");
      formData.append(
        "file",
        new File(["img"], "test.jpg", { type: "image/jpeg" }),
      );

      const response = await handle(
        mockMultipartRequest(
          "/dashboard/media/upload",
          formData,
          userCookie,
        ),
      );
      expect(response.status).toBe(403);
    });

    test("returns 400 when no file is provided", async () => {
      globalThis.fetch = createMockFetch({});

      const formData = new FormData();
      formData.append("csrf_token", userCsrfToken);

      const response = await handle(
        mockMultipartRequest(
          "/dashboard/media/upload",
          formData,
          userCookie,
        ),
      );
      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("Please select a file to upload");
    });

    test("uploads file to business folder and redirects", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": () =>
          jsonResponse({ mediaId: 99, name: "new-photo.jpg" }),
      });

      const formData = new FormData();
      formData.append("csrf_token", userCsrfToken);
      formData.append(
        "file",
        new File(["image data"], "new-photo.jpg", { type: "image/jpeg" }),
      );
      formData.append("name", "New Photo");

      const response = await handle(
        mockMultipartRequest(
          "/dashboard/media/upload",
          formData,
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        "/dashboard/media?success=",
      );
    });

    test("shows error when upload to Xibo fails", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": () =>
          new Response("Upload rejected", { status: 422 }),
      });

      const formData = new FormData();
      formData.append("csrf_token", userCsrfToken);
      formData.append(
        "file",
        new File(["image data"], "test.jpg", { type: "image/jpeg" }),
      );
      formData.append("name", "Test");

      const response = await handle(
        mockMultipartRequest(
          "/dashboard/media/upload",
          formData,
          userCookie,
        ),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Upload failed");
    });

    test("returns 400 when business folder not provisioned", async () => {
      // Create business without folder
      const biz2 = await createBusiness("No Folder Biz");
      const user2 = await createActivateAndLogin(
        "nofolder2",
        "user",
        "userpass123",
      );
      await assignUserToBusiness(biz2.id, user2.userId);

      globalThis.fetch = createMockFetch({});

      const formData = new FormData();
      formData.append("csrf_token", user2.csrfToken);
      formData.append(
        "file",
        new File(["img"], "test.jpg", { type: "image/jpeg" }),
      );

      const response = await handle(
        mockMultipartRequest(
          "/dashboard/media/upload",
          formData,
          user2.cookie,
        ),
      );
      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("Business folder not provisioned");
    });

    test("returns 400 for invalid form data", async () => {
      globalThis.fetch = createMockFetch({});

      const response = await handle(
        new Request("http://localhost/dashboard/media/upload", {
          method: "POST",
          headers: {
            cookie: userCookie,
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

  describe("POST /dashboard/media/:id/delete", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handle(
        mockFormRequest("/dashboard/media/10/delete", {
          csrf_token: "bad",
        }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("deletes own business media and redirects", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library/10": (_url, init) => {
          if (init?.method === "DELETE") {
            return new Response(null, { status: 204 });
          }
          return jsonResponse(allMedia);
        },
        "/api/library": allMediaHandler,
      });

      const response = await handle(
        mockFormRequest(
          "/dashboard/media/10/delete",
          { csrf_token: userCsrfToken },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        "/dashboard/media?success=",
      );
    });

    test("rejects delete of shared photos", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": allMediaHandler,
      });

      const response = await handle(
        mockFormRequest(
          "/dashboard/media/1/delete",
          { csrf_token: userCsrfToken },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location") || "";
      expect(location).toContain("error=");
      expect(location).toContain("only%20delete%20your%20own");
    });

    test("rejects delete of other business photos", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": allMediaHandler,
      });

      const response = await handle(
        mockFormRequest(
          "/dashboard/media/20/delete",
          { csrf_token: userCsrfToken },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location") || "";
      expect(location).toContain("error=");
      expect(location).toContain("only%20delete%20your%20own");
    });

    test("returns error for non-existent media", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": allMediaHandler,
      });

      const response = await handle(
        mockFormRequest(
          "/dashboard/media/999/delete",
          { csrf_token: userCsrfToken },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location") || "";
      expect(location).toContain("error=");
      expect(location).toContain("not%20found");
    });

    test("redirects with error when delete fails", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library/10": (_url, init) => {
          if (init?.method === "DELETE") {
            return new Response("Server Error", { status: 500 });
          }
          return jsonResponse(allMedia);
        },
        "/api/library": allMediaHandler,
      });

      const response = await handle(
        mockFormRequest(
          "/dashboard/media/10/delete",
          { csrf_token: userCsrfToken },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("error=");
    });

    test("returns 403 for invalid CSRF token", async () => {
      const response = await handle(
        mockFormRequest(
          "/dashboard/media/10/delete",
          { csrf_token: "wrong-token" },
          userCookie,
        ),
      );
      expect(response.status).toBe(403);
    });

    test("redirects with error when business folder not provisioned", async () => {
      // Create business without folder
      const biz2 = await createBusiness("No Folder Biz");
      const user2 = await createActivateAndLogin(
        "nofolder3",
        "user",
        "userpass123",
      );
      await assignUserToBusiness(biz2.id, user2.userId);

      globalThis.fetch = createMockFetch({
        "/api/library": allMediaHandler,
      });

      const response = await handle(
        mockFormRequest(
          "/dashboard/media/10/delete",
          { csrf_token: user2.csrfToken },
          user2.cookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("error=");
    });

    test("redirects with error when library fetch fails during verification", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library": () => new Response("Error", { status: 500 }),
      });

      const response = await handle(
        mockFormRequest(
          "/dashboard/media/10/delete",
          { csrf_token: userCsrfToken },
          userCookie,
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("error=");
    });
  });

  describe("GET /dashboard/media/:id/preview", () => {
    test("redirects to login when not authenticated", async () => {
      const response = await handle(
        mockRequest("/dashboard/media/10/preview"),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    test("proxies image from Xibo API", async () => {
      const imageData = new Uint8Array([137, 80, 78, 71]);
      globalThis.fetch = createMockFetch({
        "/api/library/download/10": () =>
          new Response(imageData, {
            headers: { "content-type": "image/png" },
          }),
      });

      const response = await handle(
        mockRequest("/dashboard/media/10/preview", {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("cache-control")).toContain("max-age=300");
    });

    test("returns 500 when preview fails", async () => {
      globalThis.fetch = createMockFetch({
        "/api/library/download/10": () =>
          new Response("Not Found", { status: 404 }),
      });

      const response = await handle(
        mockRequest("/dashboard/media/10/preview", {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(500);
    });

    test("uses default content type when none provided", async () => {
      const imageData = new Uint8Array([0, 1, 2, 3]);
      globalThis.fetch = createMockFetch({
        "/api/library/download/10": () => new Response(imageData),
      });

      const response = await handle(
        mockRequest("/dashboard/media/10/preview", {
          headers: { cookie: userCookie },
        }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "application/octet-stream",
      );
    });
  });
});
