/**
 * Unit tests for xibo client and media utilities with mocked fetch.
 * No real API calls are made — all HTTP interactions are intercepted.
 */

import { afterEach, beforeEach, describe, expect, it } from "#test-compat";
import { createTestDbWithSetup, resetDb } from "#test-utils";
import {
  authenticate,
  clearToken,
  del,
  get,
  getDashboardStatus,
  getRaw,
  loadXiboConfig,
  post,
  postMultipart,
  put,
  testConnection,
  XiboClientError,
} from "#xibo/client.ts";
import { cacheGet, cacheInvalidateAll } from "#xibo/cache.ts";
import { updateXiboCredentials } from "#lib/db/settings.ts";
import type { XiboConfig } from "#xibo/types.ts";
import {
  buildFolderTree,
  filterMedia,
  flattenFolderTree,
  folderBreadcrumbs,
  formatFileSize,
  isPreviewable,
  mediaTypeLabel,
} from "#xibo/media.ts";
import type { XiboFolder, XiboMedia } from "#xibo/types.ts";

/** Mock config for unit tests — no real server needed */
const MOCK_CONFIG: XiboConfig = {
  apiUrl: "https://mock-xibo.test",
  clientId: "test_client_id",
  clientSecret: "test_client_secret",
};

/** Token response from the mock auth endpoint */
const MOCK_TOKEN_RESPONSE = {
  access_token: "mock_access_token_abc123",
  token_type: "Bearer",
  expires_in: 3600,
};

/** Helper: create a JSON Response */
const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Helper: create a 204 No Content Response */
const noContentResponse = (): Response => new Response(null, { status: 204 });

/**
 * Mock fetch: intercepts globalThis.fetch with a handler.
 * The handler returns a Response for matched URLs, or null to fall through.
 * Always call restore() in a finally block.
 */
const mockFetch = (
  handler: (url: string, init?: RequestInit) => Response | null,
): { restore: () => void } => {
  const original = globalThis.fetch;
  globalThis.fetch = ((
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const result = handler(url, init);
    if (result) return Promise.resolve(result);
    return original(input, init);
  }) as typeof globalThis.fetch;
  return {
    restore: () => {
      globalThis.fetch = original;
    },
  };
};

/**
 * Standard mock handler that responds to auth + a custom API handler.
 * Returns a token for auth requests, delegates API requests to apiHandler.
 */
const withAuth = (
  apiHandler: (url: string, init?: RequestInit) => Response | null,
): ((url: string, init?: RequestInit) => Response | null) => {
  return (url: string, init?: RequestInit): Response | null => {
    if (url.includes("/api/authorize/access_token")) {
      return jsonResponse(MOCK_TOKEN_RESPONSE);
    }
    return apiHandler(url, init);
  };
};

// ---------------------------------------------------------------------------
// 1. XiboClientError
// ---------------------------------------------------------------------------

describe("xibo-unit", () => {
  describe("XiboClientError", () => {
    it("toApiError returns correct format", () => {
      const err = new XiboClientError("Something went wrong", 500);
      const apiError = err.toApiError();
      expect(apiError.httpStatus).toBe(500);
      expect(apiError.message).toBe("Something went wrong");
    });
  });

  // -------------------------------------------------------------------------
  // 2. Media utilities
  // -------------------------------------------------------------------------

  describe("media utilities", () => {
    describe("formatFileSize", () => {
      it("formats bytes", () => {
        expect(formatFileSize(0)).toBe("0 B");
        expect(formatFileSize(500)).toBe("500 B");
        expect(formatFileSize(1023)).toBe("1023 B");
      });

      it("formats KB", () => {
        expect(formatFileSize(1024)).toBe("1.0 KB");
        expect(formatFileSize(1536)).toBe("1.5 KB");
      });

      it("formats MB", () => {
        expect(formatFileSize(1048576)).toBe("1.0 MB");
        expect(formatFileSize(1572864)).toBe("1.5 MB");
      });

      it("formats GB", () => {
        expect(formatFileSize(1073741824)).toBe("1.0 GB");
        expect(formatFileSize(2684354560)).toBe("2.5 GB");
      });
    });

    describe("mediaTypeLabel", () => {
      it("returns label for known types", () => {
        expect(mediaTypeLabel("image")).toBe("Image");
        expect(mediaTypeLabel("video")).toBe("Video");
        expect(mediaTypeLabel("font")).toBe("Font");
        expect(mediaTypeLabel("module")).toBe("Module");
        expect(mediaTypeLabel("genericfile")).toBe("File");
        expect(mediaTypeLabel("playersoftware")).toBe("Player Software");
      });

      it("returns raw type for unknown types", () => {
        expect(mediaTypeLabel("audio")).toBe("audio");
        expect(mediaTypeLabel("spreadsheet")).toBe("spreadsheet");
      });
    });

    describe("isPreviewable", () => {
      it("returns true for image", () => {
        expect(isPreviewable("image")).toBe(true);
      });

      it("returns false for non-image types", () => {
        expect(isPreviewable("video")).toBe(false);
        expect(isPreviewable("font")).toBe(false);
        expect(isPreviewable("genericfile")).toBe(false);
      });
    });

    describe("buildFolderTree", () => {
      it("returns empty array for empty input", () => {
        expect(buildFolderTree([])).toEqual([]);
      });

      it("builds a flat list into a nested tree", () => {
        const flat = [
          { id: 1, text: "Root", parentId: null },
          { id: 2, text: "Child A", parentId: 1 },
          { id: 3, text: "Child B", parentId: 1 },
          { id: 4, text: "Grandchild", parentId: 2 },
        ];
        const tree = buildFolderTree(flat);
        expect(tree.length).toBe(1);
        expect(tree[0]!.text).toBe("Root");
        expect(tree[0]!.children.length).toBe(2);
        expect(tree[0]!.children[0]!.text).toBe("Child A");
        expect(tree[0]!.children[0]!.children[0]!.text).toBe("Grandchild");
        expect(tree[0]!.children[1]!.text).toBe("Child B");
      });

      it("treats orphaned nodes as roots", () => {
        const flat = [{ id: 5, text: "Orphan", parentId: 999 }];
        const tree = buildFolderTree(flat);
        expect(tree.length).toBe(1);
        expect(tree[0]!.text).toBe("Orphan");
      });
    });

    describe("flattenFolderTree", () => {
      it("flattens tree to flat list with depth", () => {
        const tree: XiboFolder[] = [
          {
            folderId: 1,
            text: "Root",
            parentId: null,
            children: [
              {
                folderId: 2,
                text: "Child",
                parentId: 1,
                children: [
                  {
                    folderId: 3,
                    text: "Grandchild",
                    parentId: 2,
                    children: [],
                  },
                ],
              },
            ],
          },
        ];
        const result = flattenFolderTree(tree);
        expect(result.length).toBe(3);
        expect(result[0]).toEqual({ folderId: 1, text: "Root", depth: 0 });
        expect(result[1]).toEqual({ folderId: 2, text: "Child", depth: 1 });
        expect(result[2]).toEqual({
          folderId: 3,
          text: "Grandchild",
          depth: 2,
        });
      });

      it("returns empty array for empty input", () => {
        expect(flattenFolderTree([])).toEqual([]);
      });
    });

    describe("folderBreadcrumbs", () => {
      const tree: XiboFolder[] = [
        {
          folderId: 1,
          text: "Root",
          parentId: null,
          children: [
            {
              folderId: 2,
              text: "Sub",
              parentId: 1,
              children: [
                {
                  folderId: 3,
                  text: "Deep",
                  parentId: 2,
                  children: [],
                },
              ],
            },
          ],
        },
      ];

      it("finds path to target folder", () => {
        const crumbs = folderBreadcrumbs(tree, 3);
        expect(crumbs.length).toBe(3);
        expect(crumbs[0]!.text).toBe("Root");
        expect(crumbs[1]!.text).toBe("Sub");
        expect(crumbs[2]!.text).toBe("Deep");
      });

      it("returns empty array for non-existent folder", () => {
        expect(folderBreadcrumbs(tree, 999).length).toBe(0);
      });
    });

    describe("filterMedia", () => {
      const media: XiboMedia[] = [
        {
          mediaId: 1,
          name: "a.jpg",
          mediaType: "image",
          storedAs: "1.jpg",
          fileSize: 100,
          duration: 10,
          tags: "",
          folderId: 1,
        },
        {
          mediaId: 2,
          name: "b.mp4",
          mediaType: "video",
          storedAs: "2.mp4",
          fileSize: 200,
          duration: 30,
          tags: "",
          folderId: 1,
        },
        {
          mediaId: 3,
          name: "c.png",
          mediaType: "image",
          storedAs: "3.png",
          fileSize: 50,
          duration: 10,
          tags: "",
          folderId: 2,
        },
      ];

      it("returns all with no filters", () => {
        expect(filterMedia(media).length).toBe(3);
      });

      it("filters by folder", () => {
        const result = filterMedia(media, 2);
        expect(result.length).toBe(1);
        expect(result[0]!.name).toBe("c.png");
      });

      it("filters by type", () => {
        const result = filterMedia(media, undefined, "video");
        expect(result.length).toBe(1);
        expect(result[0]!.name).toBe("b.mp4");
      });

      it("filters by folder and type", () => {
        const result = filterMedia(media, 1, "image");
        expect(result.length).toBe(1);
        expect(result[0]!.name).toBe("a.jpg");
      });
    });
  });

  // -------------------------------------------------------------------------
  // 3. Xibo client with mock fetch
  // -------------------------------------------------------------------------

  describe("xibo client (mocked fetch)", () => {
    beforeEach(async () => {
      await createTestDbWithSetup();
      clearToken();
      await cacheInvalidateAll();
    });

    afterEach(() => {
      clearToken();
      resetDb();
    });

    describe("authenticate", () => {
      it("succeeds with valid token response", async () => {
        const mock = mockFetch((url) => {
          if (url.includes("/api/authorize/access_token")) {
            return jsonResponse(MOCK_TOKEN_RESPONSE);
          }
          return null;
        });
        try {
          await authenticate(MOCK_CONFIG);
          // No error thrown means success
        } finally {
          mock.restore();
        }
      });

      it("throws on 401 response", async () => {
        const mock = mockFetch((url) => {
          if (url.includes("/api/authorize/access_token")) {
            return new Response("Unauthorized", { status: 401 });
          }
          return null;
        });
        try {
          await expect(authenticate(MOCK_CONFIG)).rejects.toThrow(
            XiboClientError,
          );
        } finally {
          mock.restore();
        }
      });
    });

    describe("get", () => {
      it("fetches and caches response", async () => {
        let fetchCount = 0;
        const mock = mockFetch(
          withAuth((url) => {
            if (url.includes("/api/about")) {
              fetchCount++;
              return jsonResponse({ version: "3.0.0" });
            }
            return null;
          }),
        );
        try {
          const result = await get<{ version: string }>(
            MOCK_CONFIG,
            "about",
          );
          expect(result.version).toBe("3.0.0");
          expect(fetchCount).toBe(1);

          // Verify cache was written
          const cached = await cacheGet("about");
          expect(cached).not.toBeNull();

          // Second call should use cache (fetchCount stays 1)
          const second = await get<{ version: string }>(
            MOCK_CONFIG,
            "about",
          );
          expect(second.version).toBe("3.0.0");
          expect(fetchCount).toBe(1);
        } finally {
          mock.restore();
        }
      });

      it("builds correct URL with params", async () => {
        let capturedUrl = "";
        const mock = mockFetch(
          withAuth((url) => {
            if (url.includes("/api/layout")) {
              capturedUrl = url;
              return jsonResponse([{ layoutId: 1 }]);
            }
            return null;
          }),
        );
        try {
          await get(MOCK_CONFIG, "layout", { start: "0", length: "10" });
          expect(capturedUrl).toContain("start=0");
          expect(capturedUrl).toContain("length=10");
        } finally {
          mock.restore();
        }
      });
    });

    describe("post", () => {
      it("sends JSON body and invalidates cache", async () => {
        // Prime the cache for datasets
        await cacheInvalidateAll();
        const mock = mockFetch(
          withAuth((url, init) => {
            if (url.includes("/api/dataset") && init?.method === "GET") {
              return jsonResponse([]);
            }
            if (url.includes("/api/dataset") && init?.method === "POST") {
              return jsonResponse({ dataSetId: 42, dataSet: "New" });
            }
            return null;
          }),
        );
        try {
          // Prime cache with GET
          await get(MOCK_CONFIG, "dataset");
          const cachedBefore = await cacheGet("dataset");
          expect(cachedBefore).not.toBeNull();

          // POST should invalidate the cache
          const result = await post<{ dataSetId: number }>(
            MOCK_CONFIG,
            "dataset",
            { dataSet: "New" },
          );
          expect(result.dataSetId).toBe(42);

          // Cache should be invalidated
          const cachedAfter = await cacheGet("dataset");
          expect(cachedAfter).toBeNull();
        } finally {
          mock.restore();
        }
      });
    });

    describe("del", () => {
      it("sends DELETE and returns void", async () => {
        let capturedMethod = "";
        const mock = mockFetch(
          withAuth((url, init) => {
            if (url.includes("/api/dataset/5")) {
              capturedMethod = init?.method ?? "";
              return noContentResponse();
            }
            return null;
          }),
        );
        try {
          const result = await del(MOCK_CONFIG, "dataset/5");
          expect(result).toBeUndefined();
          expect(capturedMethod).toBe("DELETE");
        } finally {
          mock.restore();
        }
      });
    });

    describe("204 response", () => {
      it("returns null from apiRequest on 204", async () => {
        const mock = mockFetch(
          withAuth((url, init) => {
            if (url.includes("/api/dataset/10") && init?.method === "DELETE") {
              return noContentResponse();
            }
            return null;
          }),
        );
        try {
          // del calls apiRequest internally; 204 should not throw
          await del(MOCK_CONFIG, "dataset/10");
        } finally {
          mock.restore();
        }
      });
    });

    describe("testConnection", () => {
      it("returns success with version", async () => {
        const mock = mockFetch(
          withAuth((url) => {
            if (url.includes("/api/about")) {
              return jsonResponse({ version: "4.1.0" });
            }
            return null;
          }),
        );
        try {
          const result = await testConnection(MOCK_CONFIG);
          expect(result.success).toBe(true);
          expect(result.message).toBe("Connected successfully");
          expect(result.version).toBe("4.1.0");
        } finally {
          mock.restore();
        }
      });

      it("returns failure message on error", async () => {
        const mock = mockFetch((url) => {
          if (url.includes("/api/authorize/access_token")) {
            return new Response("Invalid credentials", { status: 401 });
          }
          return null;
        });
        try {
          const result = await testConnection(MOCK_CONFIG);
          expect(result.success).toBe(false);
          expect(result.message).toContain("Authentication failed");
        } finally {
          mock.restore();
        }
      });
    });

    describe("getDashboardStatus", () => {
      it("returns counts when connected", async () => {
        const mock = mockFetch(
          withAuth((url) => {
            if (url.includes("/api/about")) {
              return jsonResponse({ version: "3.2.1" });
            }
            if (url.includes("/api/menuboard")) {
              return jsonResponse([{ id: 1 }, { id: 2 }]);
            }
            if (url.includes("/api/library")) {
              return jsonResponse([{ id: 1 }]);
            }
            if (url.includes("/api/layout")) {
              return jsonResponse([{ id: 1 }, { id: 2 }, { id: 3 }]);
            }
            if (url.includes("/api/dataset")) {
              return jsonResponse([]);
            }
            return null;
          }),
        );
        try {
          const status = await getDashboardStatus(MOCK_CONFIG);
          expect(status.connected).toBe(true);
          expect(status.version).toBe("3.2.1");
          expect(status.menuBoardCount).toBe(2);
          expect(status.mediaCount).toBe(1);
          expect(status.layoutCount).toBe(3);
          expect(status.datasetCount).toBe(0);
        } finally {
          mock.restore();
        }
      });

      it("returns empty when auth fails", async () => {
        const mock = mockFetch((url) => {
          if (url.includes("/api/authorize/access_token")) {
            return new Response("Unauthorized", { status: 401 });
          }
          return null;
        });
        try {
          const status = await getDashboardStatus(MOCK_CONFIG);
          expect(status.connected).toBe(false);
          expect(status.version).toBeNull();
          expect(status.menuBoardCount).toBeNull();
          expect(status.mediaCount).toBeNull();
          expect(status.layoutCount).toBeNull();
          expect(status.datasetCount).toBeNull();
        } finally {
          mock.restore();
        }
      });
    });

    describe("loadXiboConfig", () => {
      it("returns null when credentials not set", async () => {
        const result = await loadXiboConfig();
        expect(result).toBeNull();
      });

      it("returns config when credentials are set", async () => {
        await updateXiboCredentials(
          "https://xibo.example.com",
          "my_client_id",
          "my_secret",
        );
        const result = await loadXiboConfig();
        expect(result).not.toBeNull();
        expect(result!.apiUrl).toBe("https://xibo.example.com");
        expect(result!.clientId).toBe("my_client_id");
        expect(result!.clientSecret).toBe("my_secret");
      });
    });

    describe("getRaw", () => {
      it("returns raw response", async () => {
        const mock = mockFetch(
          withAuth((url) => {
            if (url.includes("/api/library/download/7/image")) {
              return new Response("binary-image-data", {
                status: 200,
                headers: { "content-type": "image/png" },
              });
            }
            return null;
          }),
        );
        try {
          const response = await getRaw(
            MOCK_CONFIG,
            "library/download/7/image",
          );
          expect(response.status).toBe(200);
          const body = await response.text();
          expect(body).toBe("binary-image-data");
        } finally {
          mock.restore();
        }
      });
    });

    describe("postMultipart", () => {
      it("sends FormData", async () => {
        let receivedContentType = "";
        const mock = mockFetch(
          withAuth((url, init) => {
            if (url.includes("/api/library") && init?.method === "POST") {
              // When FormData is sent, content-type should NOT be
              // application/json (browser sets multipart boundary)
              const headers = init?.headers as Record<string, string>;
              receivedContentType = headers?.["content-type"] ?? "";
              return jsonResponse({ mediaId: 99 });
            }
            return null;
          }),
        );
        try {
          const formData = new FormData();
          formData.append("name", "test_upload");
          formData.append(
            "files",
            new File([new Uint8Array([1, 2, 3])], "test.png", {
              type: "image/png",
            }),
          );
          const result = await postMultipart<{ mediaId: number }>(
            MOCK_CONFIG,
            "library",
            formData,
          );
          expect(result.mediaId).toBe(99);
          // When FormData is sent, content-type should not be set to json
          expect(receivedContentType).not.toBe("application/json");
        } finally {
          mock.restore();
        }
      });
    });

    describe("buildCacheKey via get behavior", () => {
      it("uses different cache keys with and without params", async () => {
        const mock = mockFetch(
          withAuth((url) => {
            if (url.includes("/api/layout")) {
              if (url.includes("start=0")) {
                return jsonResponse([{ layoutId: 1 }]);
              }
              return jsonResponse([{ layoutId: 1 }, { layoutId: 2 }]);
            }
            return null;
          }),
        );
        try {
          // GET without params
          const all = await get<{ layoutId: number }[]>(
            MOCK_CONFIG,
            "layout",
          );
          expect(all.length).toBe(2);

          // GET with params — should be a separate cache entry
          const paged = await get<{ layoutId: number }[]>(
            MOCK_CONFIG,
            "layout",
            { start: "0", length: "1" },
          );
          expect(paged.length).toBe(1);

          // Verify both are cached separately: cache for "layout" should
          // still return the original (2 items)
          const cachedAll = await cacheGet("layout");
          expect(cachedAll).not.toBeNull();
          const parsedAll = JSON.parse(cachedAll!);
          expect(parsedAll.length).toBe(2);

          // Cache for layout with params should have 1 item
          const cachedPaged = await cacheGet("layout:start=0&length=1");
          expect(cachedPaged).not.toBeNull();
          const parsedPaged = JSON.parse(cachedPaged!);
          expect(parsedPaged.length).toBe(1);
        } finally {
          mock.restore();
        }
      });
    });

    describe("401 retry logic", () => {
      it("re-authenticates on 401 and retries successfully", async () => {
        let authCallCount = 0;
        let apiCallCount = 0;
        const mock = mockFetch((url, _init) => {
          if (url.includes("/api/authorize/access_token")) {
            authCallCount++;
            return jsonResponse(MOCK_TOKEN_RESPONSE);
          }
          if (url.includes("/api/about")) {
            apiCallCount++;
            // First API call returns 401, second succeeds
            if (apiCallCount === 1) {
              return new Response("Token expired", { status: 401 });
            }
            return jsonResponse({ version: "3.0.0" });
          }
          return null;
        });
        try {
          const result = await get<{ version: string }>(
            MOCK_CONFIG,
            "about",
          );
          expect(result.version).toBe("3.0.0");
          // First auth for initial token, second auth after 401
          expect(authCallCount).toBe(2);
          // First API call returned 401, second succeeded
          expect(apiCallCount).toBe(2);
        } finally {
          mock.restore();
        }
      });
    });

    describe("safeFetch network failure", () => {
      it("throws XiboClientError on network failure", async () => {
        const mock = mockFetch(() => {
          throw new TypeError("fetch failed: network error");
        });
        try {
          await expect(authenticate(MOCK_CONFIG)).rejects.toThrow(
            XiboClientError,
          );
          try {
            await authenticate(MOCK_CONFIG);
          } catch (e) {
            expect(e).toBeInstanceOf(XiboClientError);
            expect((e as XiboClientError).httpStatus).toBe(0);
            expect((e as XiboClientError).message).toContain(
              "Failed to connect",
            );
          }
        } finally {
          mock.restore();
        }
      });
    });

    describe("clearToken", () => {
      it("forces re-authentication on next request", async () => {
        let authCallCount = 0;
        const mock = mockFetch((url) => {
          if (url.includes("/api/authorize/access_token")) {
            authCallCount++;
            return jsonResponse(MOCK_TOKEN_RESPONSE);
          }
          if (url.includes("/api/about")) {
            return jsonResponse({ version: "3.0.0" });
          }
          return null;
        });
        try {
          // First request triggers auth
          await cacheInvalidateAll();
          await get(MOCK_CONFIG, "about");
          expect(authCallCount).toBe(1);

          // Clear token — next request should re-authenticate
          clearToken();
          await cacheInvalidateAll();
          await get(MOCK_CONFIG, "about");
          expect(authCallCount).toBe(2);
        } finally {
          mock.restore();
        }
      });
    });

    describe("put", () => {
      it("sends PUT with JSON body and invalidates cache", async () => {
        let capturedMethod = "";
        let capturedBody = "";
        const mock = mockFetch(
          withAuth((url, init) => {
            if (url.includes("/api/dataset") && init?.method === "GET") {
              return jsonResponse([{ dataSetId: 1 }]);
            }
            if (url.includes("/api/dataset/1") && init?.method === "PUT") {
              capturedMethod = init?.method ?? "";
              capturedBody =
                typeof init?.body === "string" ? init.body : "";
              return jsonResponse({ dataSetId: 1, dataSet: "Updated" });
            }
            return null;
          }),
        );
        try {
          // Prime cache
          await get(MOCK_CONFIG, "dataset");
          const cachedBefore = await cacheGet("dataset");
          expect(cachedBefore).not.toBeNull();

          const result = await put<{ dataSet: string }>(
            MOCK_CONFIG,
            "dataset/1",
            { dataSet: "Updated" },
          );
          expect(result.dataSet).toBe("Updated");
          expect(capturedMethod).toBe("PUT");
          expect(capturedBody).toContain("Updated");

          // Cache should be invalidated
          const cachedAfter = await cacheGet("dataset");
          expect(cachedAfter).toBeNull();
        } finally {
          mock.restore();
        }
      });
    });

    describe("readErrorText catch block", () => {
      it("returns empty string when response.text() throws", async () => {
        const mock = mockFetch((url) => {
          if (url.includes("/api/authorize/access_token")) {
            // Return a response whose body is already consumed so .text() throws
            const res = new Response("error body", { status: 403 });
            // Override text() to throw, simulating a consumed/errored body
            res.text = () => {
              throw new Error("body already consumed");
            };
            return res;
          }
          return null;
        });
        try {
          // authenticate will call throwOnError which calls readErrorText
          // The response is 403 (not ok), so throwOnError triggers
          // readErrorText catches the text() error and returns ""
          // The resulting XiboClientError message should just be the prefix trimmed
          await expect(authenticate(MOCK_CONFIG)).rejects.toThrow(
            XiboClientError,
          );
          try {
            await authenticate(MOCK_CONFIG);
          } catch (e) {
            expect(e).toBeInstanceOf(XiboClientError);
            // With readErrorText returning "", the message is just the prefix trimmed
            expect((e as XiboClientError).message).toBe(
              "Authentication failed: 403",
            );
            expect((e as XiboClientError).httpStatus).toBe(403);
          }
        } finally {
          mock.restore();
        }
      });
    });

    describe("testConnection non-XiboClientError", () => {
      it("returns Unknown error for non-XiboClientError exceptions", async () => {
        const mock = mockFetch((url) => {
          if (url.includes("/api/authorize/access_token")) {
            return jsonResponse(MOCK_TOKEN_RESPONSE);
          }
          if (url.includes("/api/about")) {
            // Return invalid JSON — response.json() will throw SyntaxError
            return new Response("not valid json {{{", {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          return null;
        });
        try {
          const result = await testConnection(MOCK_CONFIG);
          expect(result.success).toBe(false);
          expect(result.message).toBe("Unknown error");
        } finally {
          mock.restore();
        }
      });
    });

    describe("getDashboardStatus version fetch failure", () => {
      it("returns empty status when about endpoint fails", async () => {
        const mock = mockFetch(
          withAuth((url) => {
            if (url.includes("/api/about")) {
              return new Response("Internal Server Error", { status: 500 });
            }
            return null;
          }),
        );
        try {
          const status = await getDashboardStatus(MOCK_CONFIG);
          expect(status.connected).toBe(false);
          expect(status.version).toBeNull();
          expect(status.menuBoardCount).toBeNull();
          expect(status.mediaCount).toBeNull();
          expect(status.layoutCount).toBeNull();
          expect(status.datasetCount).toBeNull();
        } finally {
          mock.restore();
        }
      });
    });

    describe("getDashboardStatus count endpoint failure", () => {
      it("returns null for failed count endpoints and values for successful ones", async () => {
        const mock = mockFetch(
          withAuth((url) => {
            if (url.includes("/api/about")) {
              return jsonResponse({ version: "3.2.1" });
            }
            if (url.includes("/api/menuboard")) {
              // menuboard endpoint fails
              return new Response("Module not installed", { status: 500 });
            }
            if (url.includes("/api/library")) {
              return jsonResponse([{ id: 1 }, { id: 2 }]);
            }
            if (url.includes("/api/layout")) {
              return jsonResponse([{ id: 1 }]);
            }
            if (url.includes("/api/dataset")) {
              return jsonResponse([{ id: 1 }, { id: 2 }, { id: 3 }]);
            }
            return null;
          }),
        );
        try {
          const status = await getDashboardStatus(MOCK_CONFIG);
          expect(status.connected).toBe(true);
          expect(status.version).toBe("3.2.1");
          // menuboard failed, so count is null
          expect(status.menuBoardCount).toBeNull();
          // other counts succeeded
          expect(status.mediaCount).toBe(2);
          expect(status.layoutCount).toBe(1);
          expect(status.datasetCount).toBe(3);
        } finally {
          mock.restore();
        }
      });
    });
  });
});
