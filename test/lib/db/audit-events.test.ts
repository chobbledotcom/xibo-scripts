import { afterEach, beforeEach, describe, expect, it } from "#test-compat";
import { createTestDb, resetDb } from "#test-utils";
import {
  countAuditEvents,
  getAuditEventById,
  getAuditEvents,
  logAuditEvent,
} from "#lib/db/audit-events.ts";

describe("audit events", () => {
  beforeEach(async () => {
    await createTestDb();
  });

  afterEach(() => {
    resetDb();
  });

  describe("logAuditEvent + getAuditEvents", () => {
    it("logs an event and retrieves it", async () => {
      await logAuditEvent({
        actorUserId: 1,
        action: "LOGIN",
        resourceType: "session",
        detail: "User logged in",
      });

      const events = await getAuditEvents();
      expect(events.length).toBe(1);
      expect(events[0]!.actor_user_id).toBe(1);
      expect(events[0]!.action).toBe("LOGIN");
      expect(events[0]!.resource_type).toBe("session");
      expect(events[0]!.detail).toBe("User logged in");
      expect(events[0]!.resource_id).toBeNull();
    });

    it("stores resource_id as a string when provided", async () => {
      await logAuditEvent({
        actorUserId: 2,
        action: "CREATE",
        resourceType: "business",
        resourceId: 42,
        detail: "Created business",
      });

      const events = await getAuditEvents();
      expect(events[0]!.resource_id).toBe("42");
    });

    it("stores string resource_id as-is", async () => {
      await logAuditEvent({
        actorUserId: 1,
        action: "DELETE",
        resourceType: "media",
        resourceId: "abc-123",
        detail: "Deleted media",
      });

      const events = await getAuditEvents();
      expect(events[0]!.resource_id).toBe("abc-123");
    });
  });

  describe("filtering", () => {
    beforeEach(async () => {
      await logAuditEvent({
        actorUserId: 1,
        action: "LOGIN",
        resourceType: "session",
        detail: "User 1 logged in",
      });
      await logAuditEvent({
        actorUserId: 2,
        action: "CREATE",
        resourceType: "business",
        resourceId: 10,
        detail: "User 2 created business",
      });
      await logAuditEvent({
        actorUserId: 1,
        action: "UPDATE",
        resourceType: "business",
        resourceId: 10,
        detail: "User 1 updated business",
      });
      await logAuditEvent({
        actorUserId: 3,
        action: "DELETE",
        resourceType: "media",
        resourceId: 5,
        detail: "User 3 deleted media",
      });
    });

    it("filters by action", async () => {
      const events = await getAuditEvents({ action: "LOGIN" });
      expect(events.length).toBe(1);
      expect(events[0]!.action).toBe("LOGIN");
    });

    it("filters by resourceType", async () => {
      const events = await getAuditEvents({ resourceType: "business" });
      expect(events.length).toBe(2);
      for (const e of events) {
        expect(e.resource_type).toBe("business");
      }
    });

    it("filters by actorUserId", async () => {
      const events = await getAuditEvents({ actorUserId: 1 });
      expect(events.length).toBe(2);
      for (const e of events) {
        expect(e.actor_user_id).toBe(1);
      }
    });

    it("combines multiple filters", async () => {
      const events = await getAuditEvents({
        actorUserId: 1,
        resourceType: "business",
      });
      expect(events.length).toBe(1);
      expect(events[0]!.action).toBe("UPDATE");
    });
  });

  describe("ordering", () => {
    it("returns events in descending ID order (most recent first)", async () => {
      await logAuditEvent({
        actorUserId: 1,
        action: "LOGIN",
        resourceType: "session",
        detail: "First",
      });
      await logAuditEvent({
        actorUserId: 1,
        action: "LOGOUT",
        resourceType: "session",
        detail: "Second",
      });
      await logAuditEvent({
        actorUserId: 1,
        action: "CREATE",
        resourceType: "business",
        detail: "Third",
      });

      const events = await getAuditEvents();
      expect(events[0]!.detail).toBe("Third");
      expect(events[1]!.detail).toBe("Second");
      expect(events[2]!.detail).toBe("First");
      expect(events[0]!.id).toBeGreaterThan(events[1]!.id);
      expect(events[1]!.id).toBeGreaterThan(events[2]!.id);
    });
  });

  describe("limit", () => {
    it("limits the number of results", async () => {
      for (let i = 0; i < 5; i++) {
        await logAuditEvent({
          actorUserId: 1,
          action: "LOGIN",
          resourceType: "session",
          detail: `Event ${i}`,
        });
      }

      const events = await getAuditEvents({ limit: 2 });
      expect(events.length).toBe(2);
    });
  });

  describe("countAuditEvents", () => {
    it("returns 0 when no events exist", async () => {
      const count = await countAuditEvents();
      expect(count).toBe(0);
    });

    it("returns total number of events", async () => {
      await logAuditEvent({
        actorUserId: 1,
        action: "LOGIN",
        resourceType: "session",
        detail: "Event 1",
      });
      await logAuditEvent({
        actorUserId: 2,
        action: "CREATE",
        resourceType: "business",
        detail: "Event 2",
      });
      await logAuditEvent({
        actorUserId: 3,
        action: "DELETE",
        resourceType: "media",
        detail: "Event 3",
      });

      const count = await countAuditEvents();
      expect(count).toBe(3);
    });
  });

  describe("getAuditEventById", () => {
    it("returns the event when found", async () => {
      await logAuditEvent({
        actorUserId: 1,
        action: "PUBLISH",
        resourceType: "screen",
        resourceId: 7,
        detail: "Published screen",
      });

      const events = await getAuditEvents();
      const id = events[0]!.id;
      const event = await getAuditEventById(id);
      expect(event).not.toBeNull();
      expect(event!.action).toBe("PUBLISH");
      expect(event!.resource_type).toBe("screen");
      expect(event!.resource_id).toBe("7");
      expect(event!.detail).toBe("Published screen");
    });

    it("returns null when not found", async () => {
      const event = await getAuditEventById(99999);
      expect(event).toBeNull();
    });
  });

  describe("created timestamp", () => {
    it("stores a valid ISO timestamp", async () => {
      await logAuditEvent({
        actorUserId: 1,
        action: "LOGIN",
        resourceType: "session",
        detail: "Timestamp check",
      });

      const events = await getAuditEvents();
      const created = events[0]!.created;
      expect(created).toContain("T");
      expect(new Date(created).getTime()).not.toBeNaN();
    });
  });
});
