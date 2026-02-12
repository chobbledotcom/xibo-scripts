import { afterEach, beforeEach, describe, expect, it } from "#test-compat";
import { createTestDb, resetDb } from "#test-utils";
import {
  completePublishAttempt,
  countPublishAttemptsByStatus,
  createPublishAttempt,
  getPublishAttemptById,
  getPublishAttempts,
  getPublishAttemptsForScreen,
} from "#lib/db/publish-attempts.ts";

describe("publish attempts", () => {
  beforeEach(async () => {
    await createTestDb();
  });

  afterEach(() => {
    resetDb();
  });

  describe("createPublishAttempt", () => {
    it("creates an attempt and returns its ID", async () => {
      const id = await createPublishAttempt(1, 10, 20);
      expect(id).toBeGreaterThan(0);

      const attempt = await getPublishAttemptById(id);
      expect(attempt).not.toBeNull();
      expect(attempt!.user_id).toBe(1);
      expect(attempt!.business_id).toBe(10);
      expect(attempt!.screen_id).toBe(20);
      expect(attempt!.status).toBe("started");
      expect(attempt!.completed_at).toBeNull();
      expect(attempt!.duration_ms).toBeNull();
      expect(attempt!.error_detail).toBeNull();
    });
  });

  describe("completePublishAttempt", () => {
    it("completes with success status", async () => {
      const id = await createPublishAttempt(1, 10, 20);
      await completePublishAttempt(id, "success", 1500);

      const attempt = await getPublishAttemptById(id);
      expect(attempt!.status).toBe("success");
      expect(attempt!.duration_ms).toBe(1500);
      expect(attempt!.completed_at).not.toBeNull();
      expect(attempt!.error_detail).toBeNull();
    });

    it("completes with failure status and error detail", async () => {
      const id = await createPublishAttempt(1, 10, 20);
      await completePublishAttempt(id, "failed", 300, "Connection timeout");

      const attempt = await getPublishAttemptById(id);
      expect(attempt!.status).toBe("failed");
      expect(attempt!.duration_ms).toBe(300);
      expect(attempt!.error_detail).toBe("Connection timeout");
      expect(attempt!.completed_at).not.toBeNull();
    });
  });

  describe("getPublishAttempts", () => {
    it("returns attempts for a business, most recent first", async () => {
      const id1 = await createPublishAttempt(1, 10, 20);
      await completePublishAttempt(id1, "success", 100);
      const id2 = await createPublishAttempt(1, 10, 21);
      await completePublishAttempt(id2, "failed", 200, "Timeout");
      const id3 = await createPublishAttempt(2, 10, 20);

      const attempts = await getPublishAttempts(10);
      expect(attempts.length).toBe(3);
      expect(attempts[0]!.id).toBe(id3);
      expect(attempts[1]!.id).toBe(id2);
      expect(attempts[2]!.id).toBe(id1);
    });

    it("does not return attempts for other businesses", async () => {
      await createPublishAttempt(1, 10, 20);
      await createPublishAttempt(1, 11, 30);

      const attempts = await getPublishAttempts(10);
      expect(attempts.length).toBe(1);
      expect(attempts[0]!.business_id).toBe(10);
    });

    it("respects the limit parameter", async () => {
      for (let i = 0; i < 5; i++) {
        await createPublishAttempt(1, 10, 20);
      }

      const attempts = await getPublishAttempts(10, 2);
      expect(attempts.length).toBe(2);
    });
  });

  describe("getPublishAttemptsForScreen", () => {
    it("returns attempts for a specific screen", async () => {
      await createPublishAttempt(1, 10, 20);
      await createPublishAttempt(1, 10, 21);
      await createPublishAttempt(1, 10, 20);

      const attempts = await getPublishAttemptsForScreen(20);
      expect(attempts.length).toBe(2);
      for (const a of attempts) {
        expect(a.screen_id).toBe(20);
      }
    });

    it("returns most recent first", async () => {
      const id1 = await createPublishAttempt(1, 10, 20);
      const id2 = await createPublishAttempt(1, 10, 20);

      const attempts = await getPublishAttemptsForScreen(20);
      expect(attempts[0]!.id).toBe(id2);
      expect(attempts[1]!.id).toBe(id1);
    });

    it("respects the limit parameter", async () => {
      for (let i = 0; i < 5; i++) {
        await createPublishAttempt(1, 10, 20);
      }

      const attempts = await getPublishAttemptsForScreen(20, 3);
      expect(attempts.length).toBe(3);
    });
  });

  describe("getPublishAttemptById", () => {
    it("returns the attempt when found", async () => {
      const id = await createPublishAttempt(1, 10, 20);
      const attempt = await getPublishAttemptById(id);
      expect(attempt).not.toBeNull();
      expect(attempt!.id).toBe(id);
    });

    it("returns null when not found", async () => {
      const attempt = await getPublishAttemptById(99999);
      expect(attempt).toBeNull();
    });
  });

  describe("countPublishAttemptsByStatus", () => {
    it("counts attempts grouped by status", async () => {
      const id1 = await createPublishAttempt(1, 10, 20);
      await completePublishAttempt(id1, "success", 100);

      const id2 = await createPublishAttempt(1, 10, 21);
      await completePublishAttempt(id2, "success", 200);

      const id3 = await createPublishAttempt(1, 10, 20);
      await completePublishAttempt(id3, "failed", 50, "Error");

      await createPublishAttempt(1, 10, 22);

      const counts = await countPublishAttemptsByStatus(10);
      expect(counts["success"]).toBe(2);
      expect(counts["failed"]).toBe(1);
      expect(counts["started"]).toBe(1);
    });

    it("returns empty object when no attempts exist", async () => {
      const counts = await countPublishAttemptsByStatus(999);
      expect(Object.keys(counts).length).toBe(0);
    });

    it("only counts attempts for the given business", async () => {
      const id1 = await createPublishAttempt(1, 10, 20);
      await completePublishAttempt(id1, "success", 100);

      const id2 = await createPublishAttempt(1, 11, 30);
      await completePublishAttempt(id2, "success", 200);

      const counts = await countPublishAttemptsByStatus(10);
      expect(counts["success"]).toBe(1);
    });
  });

  describe("created timestamp", () => {
    it("stores a valid ISO timestamp", async () => {
      const id = await createPublishAttempt(1, 10, 20);
      const attempt = await getPublishAttemptById(id);
      const created = attempt!.created;
      expect(created).toContain("T");
      expect(new Date(created).getTime()).not.toBeNaN();
    });
  });
});
