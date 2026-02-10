import { afterEach, beforeEach, describe, expect, it } from "#test-compat";
import { createTestDb, createTestDbWithSetup, resetDb } from "#test-utils";
import {
  authenticate,
  clearToken,
  del,
  get,
  getDashboardStatus,
  loadXiboConfig,
  post,
  postMultipart,
  put,
  testConnection,
  XiboClientError,
} from "#xibo/client.ts";
import { cacheGet, cacheInvalidateAll } from "#xibo/cache.ts";
import { updateXiboCredentials, invalidateSettingsCache } from "#lib/db/settings.ts";
import type { XiboConfig, XiboDataset } from "#xibo/types.ts";

/** Load config from env vars for integration tests */
const getTestConfig = (): XiboConfig | null => {
  const apiUrl = Deno.env.get("XIBO_API_URL");
  const clientId = Deno.env.get("XIBO_CLIENT_ID");
  const clientSecret = Deno.env.get("XIBO_CLIENT_SECRET");
  if (!apiUrl || !clientId || !clientSecret) return null;
  return { apiUrl, clientId, clientSecret };
};

const config = getTestConfig();
const hasCredentials = config !== null;

describe("xibo/client", () => {
  beforeEach(async () => {
    await createTestDb();
    clearToken();
    await cacheInvalidateAll();
  });

  afterEach(() => {
    clearToken();
    resetDb();
  });

  describe("XiboClientError", () => {
    it("stores httpStatus and message", () => {
      const err = new XiboClientError("test error", 404);
      expect(err.message).toBe("test error");
      expect(err.httpStatus).toBe(404);
      expect(err.name).toBe("XiboClientError");
    });

    it("converts to XiboApiError", () => {
      const err = new XiboClientError("not found", 404);
      const apiError = err.toApiError();
      expect(apiError.httpStatus).toBe(404);
      expect(apiError.message).toBe("not found");
    });
  });

  describe("authenticate", () => {
    if (!hasCredentials) return;

    it("authenticates with valid credentials", async () => {
      await authenticate(config!);
    });

    it("throws on invalid credentials", async () => {
      const badConfig: XiboConfig = {
        ...config!,
        clientSecret: "invalid_secret",
      };
      try {
        await authenticate(badConfig);
        expect(true).toBe(false);
      } catch (e) {
        expect(e).toBeInstanceOf(XiboClientError);
        expect((e as XiboClientError).message).toContain(
          "Authentication failed",
        );
      }
    });

    it("throws on unreachable server", async () => {
      const badConfig: XiboConfig = {
        apiUrl: "https://nonexistent.example.invalid",
        clientId: "x",
        clientSecret: "x",
      };
      try {
        await authenticate(badConfig);
        expect(true).toBe(false);
      } catch (e) {
        expect(e).toBeInstanceOf(XiboClientError);
        expect((e as XiboClientError).httpStatus).toBe(0);
      }
    });
  });

  describe("get", () => {
    if (!hasCredentials) return;

    it("fetches data from the API and caches response", async () => {
      const about = await get<{ version: string }>(config!, "about");
      expect(typeof about.version).toBe("string");

      // Verify cache was written
      const cached = await cacheGet("about");
      expect(cached).not.toBeNull();

      // Second call uses cache (no extra API request)
      const second = await get<{ version: string }>(config!, "about");
      expect(second.version).toBe(about.version);
    });

    it("passes query params", async () => {
      const layouts = await get<unknown[]>(config!, "layout", {
        start: "0",
        length: "1",
      });
      expect(Array.isArray(layouts)).toBe(true);
    });
  });

  describe("testConnection", () => {
    if (!hasCredentials) return;

    it("returns success with version for valid config", async () => {
      const result = await testConnection(config!);
      expect(result.success).toBe(true);
      expect(result.message).toBe("Connected successfully");
      expect(typeof result.version).toBe("string");
    });

    it("returns failure for invalid credentials", async () => {
      const badConfig: XiboConfig = {
        ...config!,
        clientSecret: "wrong",
      };
      const result = await testConnection(badConfig);
      expect(result.success).toBe(false);
      expect(result.message).toContain("Authentication failed");
    });
  });

  describe("getDashboardStatus", () => {
    if (!hasCredentials) return;

    it("returns connected status with version", async () => {
      const status = await getDashboardStatus(config!);
      expect(status.connected).toBe(true);
      expect(typeof status.version).toBe("string");
      // Counts may be numbers or null depending on CMS modules installed
      for (
        const key of ["mediaCount", "layoutCount", "datasetCount"] as const
      ) {
        const val = status[key];
        expect(val === null || typeof val === "number").toBe(true);
      }
    });

    it("returns disconnected for bad credentials", async () => {
      const badConfig: XiboConfig = {
        ...config!,
        clientSecret: "wrong",
      };
      const status = await getDashboardStatus(badConfig);
      expect(status.connected).toBe(false);
      expect(status.version).toBeNull();
    });
  });

  describe("get error handling", () => {
    if (!hasCredentials) return;

    it("throws on non-existent endpoint", async () => {
      try {
        await get(config!, "nonexistent_endpoint_xyz");
        expect(true).toBe(false);
      } catch (e) {
        expect(e).toBeInstanceOf(XiboClientError);
        expect((e as XiboClientError).httpStatus).toBeGreaterThan(0);
      }
    });
  });

  describe("testConnection with unreachable server", () => {
    it("returns failure with message for unreachable server", async () => {
      const badConfig: XiboConfig = {
        apiUrl: "https://nonexistent.example.invalid",
        clientId: "x",
        clientSecret: "x",
      };
      const result = await testConnection(badConfig);
      expect(result.success).toBe(false);
      expect(result.message).toContain("Failed to connect");
    });
  });

  describe("loadXiboConfig", () => {
    it("returns null when credentials are not stored", async () => {
      const result = await loadXiboConfig();
      expect(result).toBeNull();
    });

    it("returns config object when credentials exist", async () => {
      // Need setup complete to store encrypted credentials
      await createTestDbWithSetup();
      await updateXiboCredentials(
        "https://xibo.test",
        "test-client-id",
        "test-client-secret",
      );
      invalidateSettingsCache();

      const result = await loadXiboConfig();
      expect(result).not.toBeNull();
      expect(result!.apiUrl).toBe("https://xibo.test");
      expect(result!.clientId).toBe("test-client-id");
      expect(result!.clientSecret).toBe("test-client-secret");
    });
  });

  describe("authenticate (mocked)", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("throws on network error with XiboClientError", async () => {
      globalThis.fetch = (() =>
        Promise.reject(new Error("Network failure"))) as typeof globalThis.fetch;

      const fakeConfig: XiboConfig = {
        apiUrl: "https://fake.test",
        clientId: "x",
        clientSecret: "x",
      };

      try {
        await authenticate(fakeConfig);
        expect(true).toBe(false);
      } catch (e) {
        expect(e).toBeInstanceOf(XiboClientError);
        expect((e as XiboClientError).httpStatus).toBe(0);
      }
    });

    it("throws on non-200 auth response", async () => {
      globalThis.fetch = (() =>
        Promise.resolve(
          new Response("Unauthorized", { status: 401 }),
        )) as typeof globalThis.fetch;

      const fakeConfig: XiboConfig = {
        apiUrl: "https://fake.test",
        clientId: "x",
        clientSecret: "x",
      };

      try {
        await authenticate(fakeConfig);
        expect(true).toBe(false);
      } catch (e) {
        expect(e).toBeInstanceOf(XiboClientError);
        expect((e as XiboClientError).message).toContain(
          "Authentication failed",
        );
      }
    });
  });

  describe("getDashboardStatus (mocked)", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("returns disconnected status on error", async () => {
      globalThis.fetch = (() =>
        Promise.reject(new Error("Network failure"))) as typeof globalThis.fetch;

      const fakeConfig: XiboConfig = {
        apiUrl: "https://fake.test",
        clientId: "x",
        clientSecret: "x",
      };
      const status = await getDashboardStatus(fakeConfig);
      expect(status.connected).toBe(false);
      expect(status.version).toBeNull();
    });
  });

  describe("post/put/del", () => {
    if (!hasCredentials) return;

    it("creates, updates, and deletes a dataset", async () => {
      // POST - create a dataset (available on all CMS, no dependencies)
      const created = await post<XiboDataset>(config!, "dataset", {
        dataSet: "Test Dataset CI",
        description: "Created by automated test",
      });
      expect(created.dataSetId).toBeDefined();
      expect(created.dataSet).toBe("Test Dataset CI");

      // PUT - update
      const updated = await put<XiboDataset>(
        config!,
        `dataset/${created.dataSetId}`,
        {
          dataSet: "Test Dataset CI Updated",
          description: "Updated by automated test",
        },
      );
      expect(updated.dataSet).toBe("Test Dataset CI Updated");

      // DELETE - cleanup
      await del(config!, `dataset/${created.dataSetId}`);
    });
  });

  describe("postMultipart", () => {
    if (!hasCredentials) return;

    it("uploads a file to the library", async () => {
      const formData = new FormData();
      const pngBytes = new Uint8Array([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
        0x00,
        0x00,
        0x00,
        0x0d,
        0x49,
        0x48,
        0x44,
        0x52,
        0x00,
        0x00,
        0x00,
        0x01,
        0x00,
        0x00,
        0x00,
        0x01,
        0x08,
        0x02,
        0x00,
        0x00,
        0x00,
        0x90,
        0x77,
        0x53,
        0xde,
        0x00,
        0x00,
        0x00,
        0x0c,
        0x49,
        0x44,
        0x41,
        0x54,
        0x08,
        0xd7,
        0x63,
        0xf8,
        0xcf,
        0xc0,
        0x00,
        0x00,
        0x00,
        0x02,
        0x00,
        0x01,
        0xe2,
        0x21,
        0xbc,
        0x33,
        0x00,
        0x00,
        0x00,
        0x00,
        0x49,
        0x45,
        0x4e,
        0x44,
        0xae,
        0x42,
        0x60,
        0x82,
      ]);
      const testFile = new File([pngBytes], "test_ci.png", {
        type: "image/png",
      });
      formData.append("files", testFile);
      formData.append("name", "test_ci_upload");

      const result = await postMultipart<{ mediaId: number }>(
        config!,
        "library",
        formData,
      );
      expect(result).toBeDefined();

      // Cleanup uploaded file if possible
      if (result.mediaId) {
        await del(config!, `library/${result.mediaId}`);
      }
    });
  });
});
