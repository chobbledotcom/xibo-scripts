/**
 * Tests for SSRF protection in media URL upload
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "#test-compat";
import { validateExternalUrl } from "#routes/admin/media.ts";
import {
  createMockFetch,
  createTestDbWithSetup,
  handle,
  loginAsAdmin,
  mockFormRequest,
  resetDb,
  restoreFetch,
} from "#test-utils";
import { updateXiboCredentials } from "#lib/db/settings.ts";
import { clearToken } from "#xibo/client.ts";
import { cacheInvalidateAll } from "#xibo/cache.ts";

describe("validateExternalUrl", () => {
  test("accepts valid HTTPS URLs", () => {
    expect(validateExternalUrl("https://example.com/image.jpg")).toBeNull();
    expect(validateExternalUrl("https://cdn.example.com/path/photo.png")).toBeNull();
  });

  test("rejects non-URL strings", () => {
    expect(validateExternalUrl("not a url")).toBe("Invalid URL format");
    expect(validateExternalUrl("")).toBe("Invalid URL format");
  });

  test("rejects HTTP URLs", () => {
    expect(validateExternalUrl("http://example.com/image.jpg")).toBe(
      "Only HTTPS URLs are allowed",
    );
  });

  test("rejects file:// URLs", () => {
    expect(validateExternalUrl("file:///etc/passwd")).toBe(
      "Only HTTPS URLs are allowed",
    );
  });

  test("rejects ftp:// URLs", () => {
    expect(validateExternalUrl("ftp://example.com/file")).toBe(
      "Only HTTPS URLs are allowed",
    );
  });

  test("rejects URLs with credentials", () => {
    expect(validateExternalUrl("https://user:pass@example.com/")).toBe(
      "URLs with credentials are not allowed",
    );
    expect(validateExternalUrl("https://user@example.com/")).toBe(
      "URLs with credentials are not allowed",
    );
  });

  test("rejects localhost", () => {
    expect(validateExternalUrl("https://localhost/secret")).toBe(
      "Internal URLs are not allowed",
    );
  });

  test("rejects 127.0.0.1 loopback", () => {
    expect(validateExternalUrl("https://127.0.0.1/metadata")).toBe(
      "Internal URLs are not allowed",
    );
  });

  test("rejects ::1 IPv6 loopback", () => {
    expect(validateExternalUrl("https://[::1]/")).toBe(
      "Internal URLs are not allowed",
    );
  });

  test("rejects 0.0.0.0", () => {
    expect(validateExternalUrl("https://0.0.0.0/")).toBe(
      "Internal URLs are not allowed",
    );
  });

  test("rejects 10.x.x.x private range", () => {
    expect(validateExternalUrl("https://10.0.0.1/")).toBe(
      "Internal URLs are not allowed",
    );
    expect(validateExternalUrl("https://10.255.255.255/")).toBe(
      "Internal URLs are not allowed",
    );
  });

  test("rejects 172.16-31.x.x private range", () => {
    expect(validateExternalUrl("https://172.16.0.1/")).toBe(
      "Internal URLs are not allowed",
    );
    expect(validateExternalUrl("https://172.31.255.255/")).toBe(
      "Internal URLs are not allowed",
    );
  });

  test("allows 172.15.x.x and 172.32.x.x (not private)", () => {
    expect(validateExternalUrl("https://172.15.0.1/")).toBeNull();
    expect(validateExternalUrl("https://172.32.0.1/")).toBeNull();
  });

  test("rejects 192.168.x.x private range", () => {
    expect(validateExternalUrl("https://192.168.0.1/")).toBe(
      "Internal URLs are not allowed",
    );
    expect(validateExternalUrl("https://192.168.1.100/")).toBe(
      "Internal URLs are not allowed",
    );
  });

  test("rejects 169.254.x.x link-local / cloud metadata range", () => {
    expect(validateExternalUrl("https://169.254.169.254/")).toBe(
      "Internal URLs are not allowed",
    );
    expect(validateExternalUrl("https://169.254.0.1/")).toBe(
      "Internal URLs are not allowed",
    );
  });

  test("rejects 0.x.x.x range", () => {
    expect(validateExternalUrl("https://0.0.0.1/")).toBe(
      "Internal URLs are not allowed",
    );
  });

  test("rejects IPv6 link-local (fe80:)", () => {
    expect(validateExternalUrl("https://[fe80::1]/")).toBe(
      "Internal URLs are not allowed",
    );
  });

  test("rejects IPv6 unique local (fc00:, fd00:)", () => {
    expect(validateExternalUrl("https://[fc00::1]/")).toBe(
      "Internal URLs are not allowed",
    );
    expect(validateExternalUrl("https://[fd00::1]/")).toBe(
      "Internal URLs are not allowed",
    );
  });

  test("rejects IPv4-mapped IPv6 (::ffff:)", () => {
    expect(validateExternalUrl("https://[::ffff:127.0.0.1]/")).toBe(
      "Internal URLs are not allowed",
    );
  });

  test("rejects .internal hostnames", () => {
    expect(validateExternalUrl("https://metadata.google.internal/")).toBe(
      "Internal URLs are not allowed",
    );
  });

  test("rejects .local hostnames", () => {
    expect(validateExternalUrl("https://myservice.local/")).toBe(
      "Internal URLs are not allowed",
    );
  });
});

describe("POST /admin/media/upload-url SSRF protection", () => {
  let cookie: string;
  let csrfToken: string;

  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
    await updateXiboCredentials("https://xibo.test", "test-id", "test-secret");
    clearToken();
    await cacheInvalidateAll();
    const auth = await loginAsAdmin();
    cookie = auth.cookie;
    csrfToken = auth.csrfToken;
  });

  afterEach(() => {
    restoreFetch();
    clearToken();
    resetDb();
  });

  test("rejects HTTP URLs", async () => {
    globalThis.fetch = createMockFetch({
      "/api/folders": () => new Response("[]"),
    });

    const response = await handle(
      mockFormRequest(
        "/admin/media/upload-url",
        {
          csrf_token: csrfToken,
          url: "http://example.com/image.jpg",
          name: "test",
        },
        cookie,
      ),
    );
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain("Only HTTPS URLs are allowed");
  });

  test("rejects private IP URLs", async () => {
    globalThis.fetch = createMockFetch({
      "/api/folders": () => new Response("[]"),
    });

    const response = await handle(
      mockFormRequest(
        "/admin/media/upload-url",
        {
          csrf_token: csrfToken,
          url: "https://169.254.169.254/latest/meta-data/",
          name: "metadata",
        },
        cookie,
      ),
    );
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain("Internal URLs are not allowed");
  });

  test("rejects localhost URLs", async () => {
    globalThis.fetch = createMockFetch({
      "/api/folders": () => new Response("[]"),
    });

    const response = await handle(
      mockFormRequest(
        "/admin/media/upload-url",
        {
          csrf_token: csrfToken,
          url: "https://localhost:8080/secret",
          name: "secret",
        },
        cookie,
      ),
    );
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain("Internal URLs are not allowed");
  });
});
