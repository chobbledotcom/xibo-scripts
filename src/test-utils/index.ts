/**
 * Test utilities for the Xibo CMS management system
 */

import { type Client, createClient } from "@libsql/client";
import { setDb } from "#lib/db/client.ts";
import { initDb, LATEST_UPDATE } from "#lib/db/migrations/index.ts";
import { getSession, resetSessionCache } from "#lib/db/sessions.ts";
import { clearSetupCompleteCache, completeSetup, invalidateSettingsCache } from "#lib/db/settings.ts";

// Re-export crypto helpers (no db dependency)
export {
  TEST_ENCRYPTION_KEY,
  setupTestEncryptionKey,
  clearTestEncryptionKey,
} from "#test-utils/crypto-helpers.ts";

import { setupTestEncryptionKey } from "#test-utils/crypto-helpers.ts";

/**
 * Default test admin username
 */
export const TEST_ADMIN_USERNAME = "testadmin";

/**
 * Default test admin password
 */
export const TEST_ADMIN_PASSWORD = "testpassword123";

// Cached test database infrastructure
let cachedClient: Client | null = null;
let cachedSetupSettings: Array<{ key: string; value: string }> | null = null;
// deno-lint-ignore no-explicit-any
let cachedSetupUsers: Array<Record<string, any>> | null = null;

/** Clear all data tables and reset autoincrement counters */
const clearDataTables = async (client: Client): Promise<void> => {
  await client.execute("PRAGMA foreign_keys = OFF");
  const result = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  for (const row of result.rows) {
    const name = row.name as string;
    await client.execute(`DELETE FROM ${name}`);
  }
  await client.execute(
    "DELETE FROM sqlite_sequence WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='sqlite_sequence')",
  );
  await client.execute("PRAGMA foreign_keys = ON");
};

/** Check if the cached client's schema is still intact */
const isSchemaIntact = async (client: Client): Promise<boolean> => {
  try {
    await client.execute("SELECT 1 FROM settings LIMIT 1");
    return true;
  } catch {
    return false;
  }
};

/** Common setup: env, caches, and reuse-or-create the client */
const prepareTestClient = async (): Promise<{ reused: boolean }> => {
  setupTestEncryptionKey();
  clearSetupCompleteCache();
  resetSessionCache();

  if (cachedClient && await isSchemaIntact(cachedClient)) {
    setDb(cachedClient);
    await clearDataTables(cachedClient);
    return { reused: true };
  }

  const client = createClient({ url: ":memory:" });
  cachedClient = client;
  setDb(client);
  await initDb();
  return { reused: false };
};

/**
 * Create an in-memory database for testing (without setup).
 */
export const createTestDb = async (): Promise<void> => {
  const { reused } = await prepareTestClient();
  if (reused) {
    await cachedClient!.execute({
      sql: "INSERT INTO settings (key, value) VALUES ('latest_db_update', ?)",
      args: [LATEST_UPDATE],
    });
  }
};

/**
 * Create an in-memory database with setup already completed.
 */
export const createTestDbWithSetup = async (): Promise<void> => {
  const { reused } = await prepareTestClient();

  if (reused && cachedSetupSettings) {
    for (const row of cachedSetupSettings) {
      await cachedClient!.execute({
        sql: "INSERT INTO settings (key, value) VALUES (?, ?)",
        args: [row.key, row.value],
      });
    }
    if (cachedSetupUsers) {
      for (const row of cachedSetupUsers) {
        await cachedClient!.execute({
          sql: "INSERT INTO users (id, username_hash, username_index, password_hash, wrapped_data_key, admin_level, invite_code_hash, invite_expiry) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          args: [row.id, row.username_hash, row.username_index, row.password_hash, row.wrapped_data_key, row.admin_level, row.invite_code_hash, row.invite_expiry],
        });
      }
    }
    return;
  }

  await completeSetup(TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, "", "", "");

  // Snapshot settings and users for reuse
  const result = await cachedClient!.execute("SELECT key, value FROM settings");
  cachedSetupSettings = result.rows.map((r) => ({
    key: r.key as string,
    value: r.value as string,
  }));

  const usersResult = await cachedClient!.execute("SELECT * FROM users");
  cachedSetupUsers = usersResult.rows.map((r) => ({ ...r }));
};

/**
 * Reset the database connection and clear caches.
 */
export const resetDb = (): void => {
  setDb(null);
  clearSetupCompleteCache();
  invalidateSettingsCache();
  resetSessionCache();
};

/**
 * Invalidate the cached test database client.
 */
export const invalidateTestDbCache = (): void => {
  cachedClient = null;
  cachedSetupSettings = null;
  cachedSetupUsers = null;
};

/**
 * Create a mock Request object with a custom host
 */
export const mockRequestWithHost = (
  path: string,
  host: string,
  options: RequestInit = {},
): Request => {
  const headers = new Headers(options.headers);
  headers.set("host", host);
  return new Request(`http://${host}${path}`, { ...options, headers });
};

/**
 * Create a mock Request object (defaults to localhost)
 */
export const mockRequest = (path: string, options: RequestInit = {}): Request =>
  mockRequestWithHost(path, "localhost", options);

/**
 * Create a mock POST request with form data
 */
export const mockFormRequest = (
  path: string,
  data: Record<string, string>,
  cookie?: string,
): Request => {
  const body = new URLSearchParams(data).toString();
  const headers: HeadersInit = {
    "content-type": "application/x-www-form-urlencoded",
    host: "localhost",
  };
  if (cookie) {
    headers.cookie = cookie;
  }
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers,
    body,
  });
};

/**
 * Wait for a specified number of milliseconds
 */
export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Get CSRF token from a session cookie string
 */
export const getCsrfTokenFromCookie = async (
  cookie: string,
): Promise<string | null> => {
  const sessionMatch = cookie.match(/__Host-session=([^;]+)/);
  if (!sessionMatch?.[1]) return null;

  const sessionToken = sessionMatch[1];
  const session = await getSession(sessionToken);
  return session?.csrf_token ?? null;
};

/**
 * Extract setup CSRF token from set-cookie header
 */
export const getSetupCsrfToken = (setCookie: string | null): string | null => {
  if (!setCookie) return null;
  const match = setCookie.match(/setup_csrf=([^;]+)/);
  return match?.[1] ?? null;
};

/**
 * Create a mock setup POST request with CSRF token
 */
export const mockSetupFormRequest = (
  data: Record<string, string>,
  csrfToken: string,
): Request => {
  return mockFormRequest(
    "/setup",
    { ...data, csrf_token: csrfToken },
    `setup_csrf=${csrfToken}`,
  );
};

/**
 * Perform an admin login and return cookie + CSRF token
 */
export const loginAsAdmin = async (): Promise<{
  cookie: string;
  csrfToken: string;
}> => {
  const { handleRequest } = await import("#routes");
  const loginResponse = await handleRequest(
    mockFormRequest("/admin/login", { username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD }),
  );
  const cookie = loginResponse.headers.get("set-cookie") || "";
  const csrfToken = await getCsrfTokenFromCookie(cookie);

  if (!csrfToken) {
    throw new Error("Failed to get CSRF token for admin login");
  }

  return { cookie, csrfToken };
};

/**
 * Create a test request with common options
 */
export const testRequest = (
  path: string,
  token?: string | null,
  options: { cookie?: string; method?: string; data?: Record<string, string> } = {},
): Request => {
  const { cookie, method, data } = options;
  const headers: Record<string, string> = { host: "localhost" };

  if (token) {
    headers.cookie = `__Host-session=${token}`;
  } else if (cookie) {
    headers.cookie = cookie;
  }

  if (data) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    return new Request(`http://localhost${path}`, {
      method: method ?? "POST",
      headers,
      body: new URLSearchParams(data).toString(),
    });
  }

  return new Request(`http://localhost${path}`, {
    method: method ?? "GET",
    headers,
  });
};

/**
 * Create and execute a test request, returning the response
 */
export const awaitTestRequest = async (
  path: string,
  tokenOrOptions?: string | { cookie?: string; data?: Record<string, string> } | null,
): Promise<Response> => {
  const { handleRequest } = await import("#routes");
  if (typeof tokenOrOptions === "object" && tokenOrOptions !== null) {
    return handleRequest(testRequest(path, null, tokenOrOptions));
  }
  return handleRequest(testRequest(path, tokenOrOptions));
};

/** Restorable mock */
interface Restorable {
  mockRestore?: (() => void) | undefined;
}

/**
 * Run a test body with mocks that are automatically restored afterward.
 */
export const withMocks = async <T extends Restorable | Record<string, Restorable>>(
  setup: () => T,
  body: (mocks: T) => void | Promise<void>,
  cleanup?: () => void | Promise<void>,
): Promise<void> => {
  const mocks = setup();
  try {
    await body(mocks);
  } finally {
    if (typeof (mocks as Restorable).mockRestore === "function") {
      (mocks as Restorable).mockRestore!();
    } else {
      for (const mock of Object.values(mocks as Record<string, Restorable>)) {
        mock.mockRestore?.();
      }
    }
    await cleanup?.();
  }
};

import { expect } from "#test-compat";

/** Assert a Response has the given status code. */
export const expectStatus =
  (status: number) =>
  (response: Response): Response => {
    expect(response.status).toBe(status);
    return response;
  };

/** Assert a Response is a redirect (302) to the given location. */
export const expectRedirect =
  (location: string) =>
  (response: Response): Response => {
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(location);
    return response;
  };

/** Shorthand: assert redirect to /admin */
export const expectAdminRedirect: (response: Response) => Response =
  expectRedirect("/admin");
