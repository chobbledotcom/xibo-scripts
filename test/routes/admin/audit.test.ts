import { afterEach, beforeEach, describe, expect, it } from "#test-compat";
import {
  createActivateAndLogin,
  createTestDbWithSetup,
  handle,
  loginAsAdmin,
  mockRequest,
  resetDb,
} from "#test-utils";
import { getDb } from "#lib/db/client.ts";
import { logAuditEvent } from "#lib/db/audit-events.ts";

describe("audit log routes", () => {
  let cookie: string;

  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
    const login = await loginAsAdmin();
    cookie = login.cookie;
  });

  afterEach(() => {
    resetDb();
  });

  describe("GET /admin/audit-log (unauthenticated)", () => {
    it("redirects to /admin", async () => {
      const res = await handle(mockRequest("/admin/audit-log"));
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/admin");
    });
  });

  describe("GET /admin/audit-log (owner)", () => {
    it("returns 200 with audit log page", async () => {
      const res = await handle(
        mockRequest("/admin/audit-log", { headers: { cookie } }),
      );
      expect(res.status).toBe(200);
    });

    it("shows Audit Log heading", async () => {
      const res = await handle(
        mockRequest("/admin/audit-log", { headers: { cookie } }),
      );
      const body = await res.text();
      expect(body).toContain("Audit Log");
    });

    it("shows total event count", async () => {
      await logAuditEvent({
        actorUserId: 1,
        action: "CREATE",
        resourceType: "business",
        detail: "Created something",
      });

      const res = await handle(
        mockRequest("/admin/audit-log", { headers: { cookie } }),
      );
      const body = await res.text();
      // loginAsAdmin logs a LOGIN event, plus our event = at least 2
      expect(body).toContain("total event(s) recorded");
    });

    it("displays audit events in a table", async () => {
      await logAuditEvent({
        actorUserId: 1,
        action: "CREATE",
        resourceType: "business",
        resourceId: 42,
        detail: "Created test business",
      });

      const res = await handle(
        mockRequest("/admin/audit-log", { headers: { cookie } }),
      );
      const body = await res.text();
      expect(body).toContain("<table>");
      expect(body).toContain("CREATE");
      expect(body).toContain("business");
      expect(body).toContain("42");
      expect(body).toContain("Created test business");
    });

    it("renders all action badge styles", async () => {
      await logAuditEvent({
        actorUserId: 1,
        action: "UPDATE",
        resourceType: "business",
        detail: "Updated test",
      });
      await logAuditEvent({
        actorUserId: 1,
        action: "PUBLISH",
        resourceType: "business",
        detail: "Published test",
      });
      await logAuditEvent({
        actorUserId: 1,
        action: "IMPERSONATE",
        resourceType: "session",
        detail: "Impersonated user",
      });
      // Insert an event with an action type not covered by actionBadge
      // to exercise the default empty-string return path.
      await getDb().execute({
        sql: "INSERT INTO audit_events (created, actor_user_id, action, resource_type, detail) VALUES (datetime('now'), 1, 'CUSTOM', 'business', 'Custom action')",
        args: [],
      });

      const res = await handle(
        mockRequest("/admin/audit-log", { headers: { cookie } }),
      );
      const body = await res.text();
      expect(body).toContain("UPDATE");
      expect(body).toContain("PUBLISH");
      expect(body).toContain("IMPERSONATE");
      expect(body).toContain("CUSTOM");
    });

    it("renders resource_id dash when null", async () => {
      await logAuditEvent({
        actorUserId: 1,
        action: "CREATE",
        resourceType: "business",
        detail: "No resource ID",
      });

      const res = await handle(
        mockRequest("/admin/audit-log", { headers: { cookie } }),
      );
      const body = await res.text();
      // resource_id null renders as em dash
      expect(body).toContain("\u2014");
    });

    it("shows empty state when no audit events exist", async () => {
      // Clear all audit events (login creates one)
      await getDb().execute("DELETE FROM audit_events");

      const res = await handle(
        mockRequest("/admin/audit-log", { headers: { cookie } }),
      );
      const body = await res.text();
      expect(body).toContain("No audit events found");
      expect(body).not.toContain("<table>");
    });

    it("supports filtering by action query param", async () => {
      await logAuditEvent({
        actorUserId: 1,
        action: "LOGIN",
        resourceType: "session",
        detail: "Logged in",
      });
      await logAuditEvent({
        actorUserId: 1,
        action: "CREATE",
        resourceType: "business",
        detail: "Created biz",
      });

      const res = await handle(
        mockRequest("/admin/audit-log?action=LOGIN", { headers: { cookie } }),
      );
      const body = await res.text();
      expect(body).toContain("LOGIN");
      expect(body).not.toContain("Created biz");
    });

    it("supports filtering by resource query param", async () => {
      await logAuditEvent({
        actorUserId: 1,
        action: "CREATE",
        resourceType: "business",
        detail: "Created biz",
      });
      await logAuditEvent({
        actorUserId: 1,
        action: "DELETE",
        resourceType: "media",
        detail: "Deleted media item",
      });

      const res = await handle(
        mockRequest("/admin/audit-log?resource=media", {
          headers: { cookie },
        }),
      );
      const body = await res.text();
      expect(body).toContain("Deleted media item");
      expect(body).not.toContain("Created biz");
    });
  });

  describe("GET /admin/audit-log (non-owner roles)", () => {
    it("returns 403 for manager", async () => {
      const mgr = await createActivateAndLogin("manager", "manager", "pass123");
      const res = await handle(
        mockRequest("/admin/audit-log", { headers: { cookie: mgr.cookie } }),
      );
      expect(res.status).toBe(403);
    });

    it("returns 403 for user", async () => {
      const usr = await createActivateAndLogin("regularuser", "user", "pass123");
      const res = await handle(
        mockRequest("/admin/audit-log", { headers: { cookie: usr.cookie } }),
      );
      expect(res.status).toBe(403);
    });
  });
});
