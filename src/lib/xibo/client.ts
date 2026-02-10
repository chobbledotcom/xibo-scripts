/**
 * Xibo CMS OAuth2 API client
 *
 * Authenticates using client credentials grant, auto-refreshes on 401,
 * and provides typed HTTP methods for all Xibo API operations.
 * Responses are cached in libsql via the cache module.
 */

import {
  createRequestTimer,
  ErrorCode,
  logDebug,
  logError,
} from "#lib/logger.ts";
import { nowMs } from "#lib/now.ts";
import { cacheGet, cacheInvalidatePrefix, cacheSet } from "#xibo/cache.ts";
import type {
  ConnectionTestResult,
  DashboardStatus,
  XiboAbout,
  XiboApiError,
  XiboAuthToken,
  XiboConfig,
} from "#xibo/types.ts";

/** Margin (ms) to refresh the token before it actually expires */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

/** In-memory token store – lives for the duration of a single edge isolate */
let currentToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Clear the in-memory token (useful for testing and forced re-auth).
 */
export const clearToken = (): void => {
  currentToken = null;
  tokenExpiresAt = 0;
};

/**
 * Authenticate with the Xibo CMS and store the token.
 * Uses the OAuth2 client_credentials grant type.
 */
export const authenticate = async (config: XiboConfig): Promise<void> => {
  const timer = createRequestTimer();
  const url = `${config.apiUrl}/api/authorize/access_token`;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await safeFetch(() =>
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    })
  );

  await throwOnError(
    response,
    ErrorCode.XIBO_API_AUTH,
    `status=${response.status}`,
    `Authentication failed: ${response.status}`,
  );

  const data = (await response.json()) as XiboAuthToken;
  currentToken = data.access_token;
  tokenExpiresAt = nowMs() + data.expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS;

  logDebug("Xibo", `authenticated in ${timer()}ms`);
};

/**
 * Ensure we have a valid token, re-authenticating if needed.
 */
const ensureToken = async (config: XiboConfig): Promise<string> => {
  if (!currentToken || nowMs() >= tokenExpiresAt) {
    await authenticate(config);
  }
  return currentToken!;
};

/**
 * Custom error class for Xibo API errors.
 */
export class XiboClientError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "XiboClientError";
  }

  toApiError(): XiboApiError {
    return { httpStatus: this.httpStatus, message: this.message };
  }
}

/** Execute a fetch, throwing XiboClientError on network failure */
const safeFetch = async (
  fn: () => Promise<globalThis.Response>,
): Promise<globalThis.Response> => {
  try {
    return await fn();
  } catch (e) {
    logError({ code: ErrorCode.XIBO_API_CONNECTION, detail: String(e) });
    throw new XiboClientError("Failed to connect to Xibo CMS", 0);
  }
};

/** Read error body text from a failed response, suppressing read errors */
const readErrorText = async (
  response: globalThis.Response,
): Promise<string> => {
  try {
    return await response.text();
  } catch {
    return "";
  }
};

/** Throw XiboClientError for non-ok responses with error text and logging */
const throwOnError = async (
  response: globalThis.Response,
  code: ErrorCode,
  detail: string,
  messagePrefix: string,
): Promise<void> => {
  if (!response.ok) {
    const text = await readErrorText(response);
    logError({ code, detail });
    throw new XiboClientError(
      `${messagePrefix} ${text}`.trim(),
      response.status,
    );
  }
};

/**
 * Execute an authenticated fetch with auto-refresh on 401.
 * Shared by apiRequest and getRaw.
 */
const fetchWithAuth = async (
  config: XiboConfig,
  makeRequest: (token: string) => Promise<globalThis.Response>,
): Promise<globalThis.Response> => {
  let token = await ensureToken(config);
  let response = await safeFetch(() => makeRequest(token));

  // Auto-refresh on 401
  if (response.status === 401) {
    clearToken();
    token = await ensureToken(config);
    response = await safeFetch(() => makeRequest(token));
  }

  return response;
};

/**
 * Make an authenticated request to the Xibo API.
 * On 401, re-authenticates once and retries.
 */
const apiRequest = async (
  config: XiboConfig,
  method: string,
  endpoint: string,
  options: {
    params?: Record<string, string>;
    body?: Record<string, unknown>;
    formData?: FormData;
  } = {},
): Promise<unknown> => {
  const timer = createRequestTimer();

  const makeRequest = (token: string): Promise<globalThis.Response> => {
    let url = `${config.apiUrl}/api/${endpoint}`;
    if (options.params) {
      const qs = new URLSearchParams(options.params).toString();
      url = `${url}?${qs}`;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    let reqBody: BodyInit | undefined;
    if (options.formData) {
      reqBody = options.formData;
    } else if (options.body) {
      headers["content-type"] = "application/json";
      reqBody = JSON.stringify(options.body);
    }

    return fetch(url, { method, headers, body: reqBody });
  };

  const response = await fetchWithAuth(config, makeRequest);
  const duration = timer();
  logDebug("Xibo", `${method} ${endpoint} ${response.status} ${duration}ms`);

  await throwOnError(
    response,
    ErrorCode.XIBO_API_REQUEST,
    `${method} ${endpoint} ${response.status}`,
    `API request failed: ${method} ${endpoint} ${response.status}`,
  );

  // Some DELETE endpoints return 204 No Content
  if (response.status === 204) return null;

  return response.json();
};

/**
 * Build a cache key from endpoint + params.
 */
const buildCacheKey = (
  endpoint: string,
  params?: Record<string, string>,
): string => {
  const base = endpoint.replace(/\//g, "_");
  if (!params || Object.keys(params).length === 0) return base;
  const qs = new URLSearchParams(params).toString();
  return `${base}:${qs}`;
};

/**
 * GET with caching.  Reads from libsql cache first; on miss, fetches
 * from the API and stores the result.
 */
export const get = async <T>(
  config: XiboConfig,
  endpoint: string,
  params?: Record<string, string>,
  cacheTtlMs?: number,
): Promise<T> => {
  const cacheKey = buildCacheKey(endpoint, params);
  const cached = await cacheGet(cacheKey);
  if (cached !== null) {
    return JSON.parse(cached) as T;
  }

  const result = await apiRequest(config, "GET", endpoint, { params });
  await cacheSet(cacheKey, JSON.stringify(result), cacheTtlMs);
  return result as T;
};

/** Shared mutation handler for POST and PUT methods */
const mutate = async <T>(
  config: XiboConfig,
  method: "POST" | "PUT",
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<T> => {
  const result = await apiRequest(config, method, endpoint, { body });
  await invalidateCacheForEndpoint(endpoint);
  return result as T;
};

type MutateMethod = <T>(
  config: XiboConfig,
  endpoint: string,
  body?: Record<string, unknown>,
) => Promise<T>;

/** Create a typed mutation method for the given HTTP verb */
const createMutator = (method: "POST" | "PUT"): MutateMethod =>
  (config, endpoint, body) => mutate(config, method, endpoint, body);

/** POST (JSON body).  Invalidates related caches. */
export const post: MutateMethod = createMutator("POST");

/** PUT (JSON body).  Invalidates related caches. */
export const put: MutateMethod = createMutator("PUT");

/**
 * DELETE.  Invalidates related caches.
 */
export const del = async (
  config: XiboConfig,
  endpoint: string,
): Promise<void> => {
  await apiRequest(config, "DELETE", endpoint);
  await invalidateCacheForEndpoint(endpoint);
};

/**
 * POST with multipart form data (for file uploads).
 */
export const postMultipart = async <T>(
  config: XiboConfig,
  endpoint: string,
  formData: FormData,
): Promise<T> => {
  const result = await apiRequest(config, "POST", endpoint, { formData });
  await invalidateCacheForEndpoint(endpoint);
  return result as T;
};

/**
 * GET returning a raw Response (for binary downloads like images).
 * Does not use JSON parsing or the cache layer.
 */
export const getRaw = async (
  config: XiboConfig,
  endpoint: string,
): Promise<globalThis.Response> => {
  const timer = createRequestTimer();

  const response = await fetchWithAuth(config, (token) => {
    const url = `${config.apiUrl}/api/${endpoint}`;
    return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  });

  logDebug("Xibo", `GET(raw) ${endpoint} ${response.status} ${timer()}ms`);

  if (!response.ok) {
    throw new XiboClientError(
      `API request failed: GET ${endpoint} ${response.status}`,
      response.status,
    );
  }

  return response;
};

/**
 * Invalidate caches related to a mutated endpoint.
 * Extracts the entity prefix from the endpoint path.
 */
const invalidateCacheForEndpoint = async (endpoint: string): Promise<void> => {
  // Extract the first path segment as the entity prefix, e.g.
  // "menuboard/5/category" → "menuboard"
  const prefix = endpoint.split("/")[0];
  if (prefix) {
    await cacheInvalidatePrefix(prefix);
  }
};

/**
 * Test the connection to the Xibo CMS by authenticating and
 * fetching the /about endpoint.
 */
export const testConnection = async (
  config: XiboConfig,
): Promise<ConnectionTestResult> => {
  try {
    clearToken();
    await authenticate(config);
    const about = (await apiRequest(config, "GET", "about")) as XiboAbout;
    return {
      success: true,
      message: "Connected successfully",
      version: about.version,
    };
  } catch (e) {
    let message: string;
    if (e instanceof XiboClientError) {
      message = e.message;
    } else {
      message = "Unknown error";
    }
    return { success: false, message };
  }
};

/**
 * Fetch dashboard summary: connection status + entity counts.
 * Uses the cache aggressively — each count is cached individually.
 */
export const getDashboardStatus = async (
  config: XiboConfig,
): Promise<DashboardStatus> => {
  const empty: DashboardStatus = {
    connected: false,
    version: null,
    menuBoardCount: null,
    mediaCount: null,
    layoutCount: null,
    datasetCount: null,
  };

  try {
    await ensureToken(config);
  } catch {
    return empty;
  }

  // Fetch version
  let version: string | null = null;
  try {
    const about = await get<XiboAbout>(config, "about");
    version = about.version || null;
  } catch {
    return empty;
  }

  // Fetch counts in parallel — each uses its own cache key
  const countEndpoints = [
    "menuboard",
    "library",
    "layout",
    "dataset",
  ] as const;

  const counts = await Promise.all(
    countEndpoints.map(async (ep) => {
      try {
        const data = await get<unknown[]>(config, ep);
        return data.length;
      } catch {
        return null;
      }
    }),
  );

  const menuBoardCount = counts[0] !== undefined ? counts[0] : null;
  const mediaCount = counts[1] !== undefined ? counts[1] : null;
  const layoutCount = counts[2] !== undefined ? counts[2] : null;
  const datasetCount = counts[3] !== undefined ? counts[3] : null;

  return {
    connected: true,
    version,
    menuBoardCount,
    mediaCount,
    layoutCount,
    datasetCount,
  };
};

/**
 * Load Xibo API config from the database (decrypted).
 * Returns null if any credential is missing.
 */
export const loadXiboConfig = async (): Promise<XiboConfig | null> => {
  const { getXiboApiUrl, getXiboClientId, getXiboClientSecret } = await import(
    "#lib/db/settings.ts"
  );
  const [apiUrl, clientId, clientSecret] = await Promise.all([
    getXiboApiUrl(),
    getXiboClientId(),
    getXiboClientSecret(),
  ]);
  if (!apiUrl || !clientId || !clientSecret) return null;
  return { apiUrl, clientId, clientSecret };
};
