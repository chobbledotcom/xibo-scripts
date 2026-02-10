import { afterEach, beforeEach, describe, expect, test } from "#test-compat";
import { createTestDb, resetDb } from "#test-utils";
import {
  clearLoginAttempts,
  isLoginRateLimited,
  recordFailedLogin,
} from "#lib/db/login-attempts.ts";

describe("login attempts", () => {
  beforeEach(async () => {
    await createTestDb();
  });

  afterEach(() => {
    resetDb();
  });

  describe("isLoginRateLimited", () => {
    test("returns false for unknown IP", async () => {
      expect(await isLoginRateLimited("192.168.1.1")).toBe(false);
    });

    test("returns false after fewer than 5 failures", async () => {
      const ip = "10.0.0.1";
      for (let i = 0; i < 4; i++) {
        await recordFailedLogin(ip);
      }
      expect(await isLoginRateLimited(ip)).toBe(false);
    });
  });

  describe("recordFailedLogin", () => {
    test("creates record on first failure", async () => {
      const ip = "10.0.0.2";
      await recordFailedLogin(ip);
      // Should not be rate limited after 1 failure
      expect(await isLoginRateLimited(ip)).toBe(false);
    });

    test("sets locked_until after 5 failures", async () => {
      const ip = "10.0.0.3";
      for (let i = 0; i < 5; i++) {
        await recordFailedLogin(ip);
      }
      expect(await isLoginRateLimited(ip)).toBe(true);
    });
  });

  describe("clearLoginAttempts", () => {
    test("removes record for IP", async () => {
      const ip = "10.0.0.4";
      for (let i = 0; i < 5; i++) {
        await recordFailedLogin(ip);
      }
      expect(await isLoginRateLimited(ip)).toBe(true);

      await clearLoginAttempts(ip);
      expect(await isLoginRateLimited(ip)).toBe(false);
    });
  });
});
