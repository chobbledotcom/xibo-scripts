import { describe, expect, test } from "#test-compat";
import { now, nowIso, nowMs, today } from "#lib/now.ts";

describe("now", () => {
  describe("now()", () => {
    test("returns a Date object", () => {
      const result = now();
      expect(result instanceof Date).toBe(true);
    });

    test("returns a recent timestamp", () => {
      const result = now();
      const diff = Date.now() - result.getTime();
      expect(diff).toBeGreaterThanOrEqual(0);
      expect(diff).toBeLessThan(1000);
    });
  });

  describe("today()", () => {
    test("returns YYYY-MM-DD format", () => {
      const result = today();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test("returns today's date", () => {
      const result = today();
      const expected = new Date().toISOString().slice(0, 10);
      expect(result).toBe(expected);
    });
  });

  describe("nowIso()", () => {
    test("returns full ISO-8601 timestamp", () => {
      const result = nowIso();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe("nowMs()", () => {
    test("returns epoch milliseconds", () => {
      const result = nowMs();
      expect(typeof result).toBe("number");
      const diff = Date.now() - result;
      expect(diff).toBeGreaterThanOrEqual(0);
      expect(diff).toBeLessThan(1000);
    });
  });
});
