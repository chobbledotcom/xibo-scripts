import { afterEach, beforeEach, describe, expect, it } from "#test-compat";
import { createTestDb, resetDb } from "#test-utils";
import {
  clearLoginAttempts,
  isLoginRateLimited,
  recordFailedLogin,
} from "#lib/db/login-attempts.ts";

describe("login rate limiting (DB layer)", () => {
  beforeEach(async () => {
    await createTestDb();
  });

  afterEach(() => {
    resetDb();
  });

  describe("isLoginRateLimited", () => {
    it("returns false for unknown IP", async () => {
      expect(await isLoginRateLimited("10.0.0.1")).toBe(false);
    });

    it("returns false after fewer than 5 failures", async () => {
      for (let i = 0; i < 4; i++) {
        await recordFailedLogin("10.0.0.2");
      }
      expect(await isLoginRateLimited("10.0.0.2")).toBe(false);
    });
  });

  describe("recordFailedLogin", () => {
    it("creates record on first failure", async () => {
      await recordFailedLogin("10.0.0.3");
      // Not rate limited after just one failure
      expect(await isLoginRateLimited("10.0.0.3")).toBe(false);
    });

    it("increments on subsequent failures", async () => {
      await recordFailedLogin("10.0.0.4");
      await recordFailedLogin("10.0.0.4");
      await recordFailedLogin("10.0.0.4");
      // Still not locked after 3
      expect(await isLoginRateLimited("10.0.0.4")).toBe(false);
    });

    it("sets locked_until after 5 failures", async () => {
      for (let i = 0; i < 5; i++) {
        await recordFailedLogin("10.0.0.5");
      }
      expect(await isLoginRateLimited("10.0.0.5")).toBe(true);
    });
  });

  describe("clearLoginAttempts", () => {
    it("removes record for IP", async () => {
      for (let i = 0; i < 5; i++) {
        await recordFailedLogin("10.0.0.6");
      }
      expect(await isLoginRateLimited("10.0.0.6")).toBe(true);
      await clearLoginAttempts("10.0.0.6");
      expect(await isLoginRateLimited("10.0.0.6")).toBe(false);
    });
  });

  describe("lockout expiry", () => {
    it("returns true during lockout window", async () => {
      for (let i = 0; i < 5; i++) {
        await recordFailedLogin("10.0.0.7");
      }
      expect(await isLoginRateLimited("10.0.0.7")).toBe(true);
    });

    it("returns false after lockout expires (mock nowMs)", async () => {
      const { getDb } = await import("#lib/db/client.ts");
      for (let i = 0; i < 5; i++) {
        await recordFailedLogin("10.0.0.8");
      }
      expect(await isLoginRateLimited("10.0.0.8")).toBe(true);

      // Set locked_until to the past
      await getDb().execute({
        sql: "UPDATE login_attempts SET locked_until = ? WHERE ip = ?",
        args: [Date.now() - 1000, "10.0.0.8"],
      });
      // Should return false and clear the record
      expect(await isLoginRateLimited("10.0.0.8")).toBe(false);
    });
  });
});
