import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "#test-compat";
import { createTestDb, resetDb } from "#test-utils";
import {
  cacheDelete,
  cacheGet,
  cacheInvalidateAll,
  cacheInvalidatePrefix,
  cachePurgeExpired,
  cacheSet,
  DEFAULT_CACHE_TTL_MS,
} from "#xibo/cache.ts";

describe("xibo/cache", () => {
  beforeEach(async () => {
    await createTestDb();
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
  });

  afterEach(() => {
    jest.useRealTimers();
    resetDb();
  });

  describe("cacheGet", () => {
    it("returns null on cache miss", async () => {
      const result = await cacheGet("nonexistent");
      expect(result).toBeNull();
    });

    it("returns cached value on hit", async () => {
      await cacheSet("test_key", '{"data":"hello"}');
      const result = await cacheGet("test_key");
      expect(result).toBe('{"data":"hello"}');
    });

    it("returns null and deletes entry when expired", async () => {
      await cacheSet("expiring", "value", 1000);
      jest.setSystemTime(1_000_000 + 1001);
      const result = await cacheGet("expiring");
      expect(result).toBeNull();
    });

    it("returns value when not yet expired", async () => {
      await cacheSet("fresh", "value", 5000);
      jest.setSystemTime(1_000_000 + 4999);
      const result = await cacheGet("fresh");
      expect(result).toBe("value");
    });
  });

  describe("cacheSet", () => {
    it("stores a value with default TTL", async () => {
      await cacheSet("key1", "value1");
      const result = await cacheGet("key1");
      expect(result).toBe("value1");
    });

    it("overwrites existing value", async () => {
      await cacheSet("key1", "first");
      await cacheSet("key1", "second");
      const result = await cacheGet("key1");
      expect(result).toBe("second");
    });

    it("uses custom TTL", async () => {
      await cacheSet("short", "val", 100);
      jest.setSystemTime(1_000_000 + 101);
      const result = await cacheGet("short");
      expect(result).toBeNull();
    });

    it("exports DEFAULT_CACHE_TTL_MS as 30 seconds", () => {
      expect(DEFAULT_CACHE_TTL_MS).toBe(30_000);
    });
  });

  describe("cacheDelete", () => {
    it("removes a specific key", async () => {
      await cacheSet("a", "1");
      await cacheSet("b", "2");
      await cacheDelete("a");
      expect(await cacheGet("a")).toBeNull();
      expect(await cacheGet("b")).toBe("2");
    });

    it("does nothing for nonexistent key", async () => {
      await cacheDelete("nonexistent");
    });
  });

  describe("cacheInvalidatePrefix", () => {
    it("removes all keys matching prefix", async () => {
      await cacheSet("menuboard_list", "boards");
      await cacheSet("menuboard_5", "board5");
      await cacheSet("library_list", "media");
      await cacheInvalidatePrefix("menuboard");
      expect(await cacheGet("menuboard_list")).toBeNull();
      expect(await cacheGet("menuboard_5")).toBeNull();
      expect(await cacheGet("library_list")).toBe("media");
    });
  });

  describe("cacheInvalidateAll", () => {
    it("removes all cached entries", async () => {
      await cacheSet("a", "1");
      await cacheSet("b", "2");
      await cacheSet("c", "3");
      await cacheInvalidateAll();
      expect(await cacheGet("a")).toBeNull();
      expect(await cacheGet("b")).toBeNull();
      expect(await cacheGet("c")).toBeNull();
    });
  });

  describe("cachePurgeExpired", () => {
    it("removes expired entries and returns count", async () => {
      await cacheSet("expired1", "v", 100);
      await cacheSet("expired2", "v", 200);
      await cacheSet("fresh", "v", 10000);
      jest.setSystemTime(1_000_000 + 300);
      const purged = await cachePurgeExpired();
      expect(purged).toBe(2);
      expect(await cacheGet("fresh")).toBe("v");
    });

    it("returns 0 when nothing to purge", async () => {
      await cacheSet("fresh", "v", 10000);
      const purged = await cachePurgeExpired();
      expect(purged).toBe(0);
    });
  });
});
