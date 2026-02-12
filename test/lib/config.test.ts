import { afterEach, beforeEach, describe, expect, test } from "#test-compat";
import { getAllowedDomain } from "#lib/config.ts";

describe("getAllowedDomain", () => {
  let originalValue: string | undefined;

  beforeEach(() => {
    originalValue = Deno.env.get("ALLOWED_DOMAIN");
  });

  afterEach(() => {
    if (originalValue !== undefined) {
      Deno.env.set("ALLOWED_DOMAIN", originalValue);
    } else {
      Deno.env.delete("ALLOWED_DOMAIN");
    }
  });

  test("returns the ALLOWED_DOMAIN value when set", () => {
    Deno.env.set("ALLOWED_DOMAIN", "example.com");
    expect(getAllowedDomain()).toBe("example.com");
  });

  test("throws when ALLOWED_DOMAIN is not set", () => {
    Deno.env.delete("ALLOWED_DOMAIN");
    expect(() => getAllowedDomain()).toThrow(
      "ALLOWED_DOMAIN environment variable is required",
    );
  });
});
