/**
 * Mock Xibo API fetch helpers for tests.
 *
 * Two patterns are provided:
 *
 * 1. `mockXiboFetch(handler)` — simple handler that returns `Response | null`.
 *    Returns a `{ restore }` disposable. Non-matching requests fall through to real fetch.
 *
 * 2. `createMockFetch(handlers)` — record of URL-pattern → handler.
 *    Auto-responds to OAuth token requests. Assign to `globalThis.fetch` and call
 *    `restoreFetch()` in afterEach.
 */

/** Saved reference to the real fetch, captured at module load time. */
const originalFetch = globalThis.fetch;

/** Restore `globalThis.fetch` to the real implementation. */
export const restoreFetch = (): void => {
  globalThis.fetch = originalFetch;
};

/** Resolve a `RequestInfo | URL` input to a URL string. */
const toUrl = (input: RequestInfo | URL): string =>
  typeof input === "string"
    ? input
    : input instanceof URL
    ? input.toString()
    : input.url;

/** Create a JSON Response body with optional status code. */
export const jsonResponse = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Standard OAuth token response for mocked Xibo API calls. */
export const tokenResponse = (): Response =>
  jsonResponse({
    access_token: "test-token",
    token_type: "Bearer",
    expires_in: 3600,
  });

/**
 * Mock fetch with a simple handler function.
 * If the handler returns a Response, that is used. If it returns null, the
 * request falls through to the real fetch.
 *
 * Returns a `{ restore }` disposable to put the real fetch back.
 */
export const mockXiboFetch = (
  handler: (url: string, init?: RequestInit) => Response | null,
): { restore: () => void } => {
  globalThis.fetch = ((
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = toUrl(input);
    const result = handler(url, init);
    if (result) return Promise.resolve(result);
    return originalFetch(input, init);
  }) as typeof globalThis.fetch;
  return { restore: restoreFetch };
};

/**
 * Create a mock fetch function from a record of URL-pattern handlers.
 * Automatically responds to `/api/authorize/access_token` with a valid
 * token. Assign the result to `globalThis.fetch`.
 */
export const createMockFetch = (
  handlers: Record<
    string,
    (url: string, init?: RequestInit) => Response | Promise<Response>
  >,
): typeof globalThis.fetch =>
  ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = toUrl(input);

    if (url.includes("/api/authorize/access_token")) {
      return Promise.resolve(tokenResponse());
    }

    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        return Promise.resolve(handler(url, init));
      }
    }

    return originalFetch(input, init);
  }) as typeof globalThis.fetch;
