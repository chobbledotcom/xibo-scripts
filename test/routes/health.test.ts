import { afterEach, beforeEach, describe, expect, it } from "#test-compat";
import { createTestDb, resetDb } from "#test-utils";
import { setDb } from "#lib/db/client.ts";
import { handleHealthCheck } from "#routes/health.ts";

describe("health check", () => {
  beforeEach(async () => {
    await createTestDb();
  });

  afterEach(() => {
    resetDb();
  });

  describe("handleHealthCheck", () => {
    it("returns 200 when DB is connected", async () => {
      const res = await handleHealthCheck();
      expect(res.status).toBe(200);
    });

    it("returns content-type application/json", async () => {
      const res = await handleHealthCheck();
      expect(res.headers.get("content-type")).toBe("application/json");
    });

    it("includes status ok when healthy", async () => {
      const res = await handleHealthCheck();
      const body = await res.json();
      expect(body.status).toBe("ok");
    });

    it("includes db connected", async () => {
      const res = await handleHealthCheck();
      const body = await res.json();
      expect(body.db).toBe("connected");
    });

    it("includes dbLatencyMs as a number", async () => {
      const res = await handleHealthCheck();
      const body = await res.json();
      expect(typeof body.dbLatencyMs).toBe("number");
      expect(body.dbLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it("returns 503 with degraded status when DB connection fails", async () => {
      setDb(null);
      const res = await handleHealthCheck();
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.status).toBe("degraded");
      expect(body.db).toBe("error");
      expect(typeof body.dbLatencyMs).toBe("number");
    });
  });
});
