# xibo-scripts

A web-based Xibo CMS management tool using Bunny Edge Scripting and libsql.

Manages menu boards, media library, layouts, and datasets in a Xibo CMS instance through an admin web interface deployed to the CDN edge.

## Getting Started

Run `./setup.sh` to install Deno, cache dependencies, and run all precommit checks (typecheck, lint, tests).

## Runtime Environment

- **Production**: Bunny Edge Scripting (Deno-based runtime on Bunny CDN)
- **Development/Testing**: Deno (for `deno task test`, `deno task start`, package management)
- **Build**: `esbuild` with `platform: "browser"` bundles to a single edge-compatible file

Code must work in both environments. The edge runtime is Deno-based, so development with Deno ensures parity.

## Preferences

- **Use FP methods**: Prefer curried functional utilities from `#fp` over imperative loops
- **100% test coverage**: All code must have complete test coverage

## FP Imports

```typescript
import { pipe, filter, map, reduce, compact, unique } from "#fp";
```

### Common Patterns

```typescript
// Compose operations
const processItems = pipe(
  filter(item => item.active),
  map(item => item.name),
  unique
);

// Instead of forEach, use for...of or curried filter/map
for (const item of items) {
  // ...
}

// Instead of array spread in reduce, use reduce with mutation
const result = reduce((acc, item) => {
  acc.push(item.value);
  return acc;
}, [])(items);
```

### Available FP Functions

| Function | Purpose |
|----------|---------|
| `pipe(...fns)` | Compose functions left-to-right |
| `filter(pred)` | Curried array filter |
| `map(fn)` | Curried array map |
| `flatMap(fn)` | Curried array flatMap |
| `reduce(fn, init)` | Curried array reduce |
| `sort(cmp)` | Non-mutating sort |
| `sortBy(key)` | Sort by property/getter |
| `unique(arr)` | Remove duplicates |
| `uniqueBy(fn)` | Dedupe by key |
| `compact(arr)` | Remove falsy values |
| `pick(keys)` | Extract object keys |
| `memoize(fn)` | Cache function results |
| `groupBy(fn)` | Group array items |

## Scripts

- `deno task start` - Run the server
- `deno task test` - Run tests
- `deno task test:coverage` - Run tests with coverage
- `deno task lint` - Check code with Deno lint
- `deno task fmt` - Format code with Deno fmt
- `deno task build:edge` - Build for Bunny Edge deployment
- `deno task precommit` - Run all checks (typecheck, lint, tests)

## Environment Variables

Environment variables are configured as **Bunny native secrets** in the Bunny Edge Scripting dashboard. They are read at runtime via `process.env`.

### Required (configure in Bunny dashboard)

- `DB_URL` - Database URL (required, e.g. `libsql://your-db.turso.io`)
- `DB_TOKEN` - Database auth token (required for remote databases)
- `DB_ENCRYPTION_KEY` - 32-byte base64-encoded encryption key (required)
- `ALLOWED_DOMAIN` - Domain for security validation (required)

### Optional

- `PORT` - Server port (defaults to 3000, local dev only)

### Dev/Test Environment

These env vars are available in the dev environment for running integration tests against a real Xibo CMS:

- `XIBO_API_URL` - Xibo CMS base URL
- `XIBO_CLIENT_ID` - OAuth2 client ID
- `XIBO_CLIENT_SECRET` - OAuth2 client secret

### Xibo Configuration

Xibo API credentials (URL, Client ID, Client Secret) are configured via the admin settings page (`/admin/settings`) and stored encrypted in the database. They are NOT environment variables.

Admin password is set through the web-based setup page at `/setup/` and stored encrypted in the database.

## Deno Configuration

The project uses `deno.json` for configuration:
- Import maps for `#` prefixed aliases
- npm packages via `npm:` specifier
- JSR packages via `jsr:` specifier

## Test Framework

Tests use a custom compatibility layer (`#test-compat`) that provides Jest-like APIs:
- `describe`, `test`, `it` for test organization
- `expect()` for assertions
- `beforeEach`, `afterEach` for setup/teardown
- `jest.fn()`, `spyOn()` for mocking

## Test Quality Standards

All tests must meet these mandatory criteria:

### 1. Tests Production Code, Not Reimplementations
- Import and call actual production functions
- Never copy-paste or reimplement production logic in tests
- Import constants from production code, don't hardcode

### 2. Not Tautological
- Never assert a value you just set (e.g., `expect(true).toBe(true)`)
- Always have production code execution between setup and assertion
- Verify behavior, not that JavaScript assignment works

### 3. Tests Behavior, Not Implementation Details
- Verify observable outcomes (HTTP status, content, state changes)
- Refactoring shouldn't break tests unless behavior changes
- Answer "does it work?" not "is it structured this way?"

### 4. Has Clear Failure Semantics
- Test names describe the specific behavior being verified
- When a test fails, it should be obvious what's broken
- Use descriptive assertion messages

### 5. Isolated and Repeatable
- Tests clean up after themselves (use `beforeEach`/`afterEach`)
- Tests don't depend on other tests running first
- No time-dependent flakiness

### 6. Tests One Thing
- Each test has a single reason to fail
- If you need "and" in the description, split the test

### Coverage Requirements

100% test coverage is required to merge into main. To find which specific lines are uncovered, run:

```bash
deno task test:coverage
```

Then check `coverage/` for detailed coverage information.

### Test Utilities

Use helpers from `#test-utils` instead of defining locally:

```typescript
import { mockRequest, mockFormRequest, createTestDb, resetDb } from "#test-utils";
```

### Integration Tests (Xibo API)

Tests in `test/lib/xibo/` run against a real Xibo CMS instance using env vars (`XIBO_API_URL`, `XIBO_CLIENT_ID`, `XIBO_CLIENT_SECRET`). These are always available in the dev environment.

- **No mocking** — tests hit the real API, so avoid excessive calls that add latency
- **Clean up after yourself** — if a test creates an entity (dataset, layout, media), delete it at the end
- **Combine related assertions** in a single test when they share setup (e.g., create + update + delete in one test) to minimize API round-trips
- **Use `dataset` for CRUD tests** — datasets have no dependencies and are available on all CMS instances
- **Menu Board module may not be installed** — the `menuboard` API endpoint can return 500; tests should handle this gracefully

### Anti-Patterns to Avoid

| Anti-Pattern | What To Do Instead |
|--------------|-------------------|
| `expect(true).toBe(true)` | Assert on actual behavior/state |
| Reimplementing production logic | Import and call production code |
| Duplicating test helpers | Use `#test-utils` |
| Magic numbers/strings | Import constants from production |
| Testing private internals | Test public API behavior |

## Xibo API Client

The Xibo API client (`src/lib/xibo/client.ts`) handles OAuth2 authentication and provides typed HTTP methods:

- **Config**: Loaded from encrypted DB settings via `loadXiboConfig()`
- **Auth**: Client credentials grant → `POST /api/authorize/access_token`
- **Auto-refresh**: On 401, re-authenticates once and retries
- **Caching**: GET responses cached in libsql (`src/lib/xibo/cache.ts`) with 30s TTL
- **Cache invalidation**: Mutations (POST/PUT/DELETE) invalidate caches by endpoint prefix

### Import alias

```typescript
import { get, post, put, del, testConnection } from "#xibo/client.ts";
import type { XiboConfig, XiboLayout } from "#xibo/types.ts";
import { cacheGet, cacheSet, cacheInvalidateAll } from "#xibo/cache.ts";
```

## Domain Context

This tool manages a Xibo CMS that drives digital signage layouts. The primary entities are **layouts** (the main display format), **media** (images/videos in the library), and **datasets** (structured data). Menu boards were originally planned but the CMS module may not be available — layouts are the core entity we work with. Always base new work on the existing codebase patterns and code, not on assumptions.

## Codebase Rules

These rules reflect patterns consistently followed across the codebase. Follow them when adding or modifying code.

### Architecture & Structure

- **Domain-based layering** — `lib/` for business logic & infrastructure, `routes/` for HTTP handlers, `templates/` for JSX views. Routes never contain business logic directly; they delegate to `lib/`.
- **Lazy loading for routes** — Top-level route modules use `once()` + dynamic `import()` to defer loading until first request, keeping cold-start fast on the edge.
- **Cross-runtime compatibility** — All code must work on both Bunny Edge Scripting (production) and Deno (dev/test). Environment access goes through `getEnv()` from `#lib/env.ts`, never `Deno.env` or `process.env` directly.

### Routing

- **Declarative route maps** — Routes are plain objects keyed by `"METHOD /path"` strings (e.g., `"GET /admin/login"`), spread-merged from sub-modules, then passed to `createRouter()`.
- **Route handler signature** — Always `(request: Request, params: RouteParams, server?: ServerContext) => Response | Promise<Response>`. Params ending in `Id` or named `id` auto-match digits only.
- **Higher-order route wrappers** — Common concerns (session auth, Xibo config, CSRF validation) are composed via HOFs like `sessionRoute()`, `detailRoute()`, `listRoute()`, and `withXiboSession()` rather than middleware chains.

### Functional Programming

- **Curried FP utilities over imperative loops** — Use `pipe`, `map`, `filter`, `reduce`, `compact`, `unique` from `#fp` instead of `for` loops or method chains. For side effects, `for...of` is acceptable.
- **`lazyRef()` for resettable singletons** — Database connections, caches, and other stateful singletons use `lazyRef()` which returns a `[getter, setter]` tuple. Setting to `null` resets the lazy initializer — critical for test isolation.
- **`Result<T>` type for fallible operations** — Functions that can fail with an HTTP response return `Result<T> = { ok: true; value: T } | { ok: false; response: Response }` instead of throwing.
- **`bracket()` for resource management** — Acquire/use/release pattern for resources that need cleanup, ensuring `finally` semantics.

### Security

- **All sensitive data encrypted at rest** — Usernames, API credentials, admin levels, and data keys are encrypted before database storage. Use `encrypt()`/`decrypt()` from `#lib/crypto.ts`.
- **Constant-time comparison for secrets** — Always use `constantTimeEqual()` for tokens, hashes, and any secret comparison. Never use `===`.
- **`__Host-` prefixed cookies** — Session cookies use `__Host-session` with `HttpOnly; Secure; SameSite=Strict` flags. No exceptions.
- **Double-submit CSRF protection** — All mutation forms include a `csrf_token` hidden field validated against the cookie value via `requireCsrfForm()`.
- **Login rate limiting + timing attack prevention** — Failed logins are tracked per IP via `isLoginRateLimited()`, and all login attempts include a random delay via `randomDelay()`.

### Database

- **`queryOne<T>()` returns `T | null`** — Single-row queries go through `queryOne()`, never raw `execute()`. Multi-row queries use `execute()` directly. Batch reads use `queryBatch()`.
- **Idempotent migrations** — Migration functions use try/catch to silently skip already-applied changes. A `latest_db_update` settings key tracks the current schema version.
- **In-memory cache with short TTL** — Settings and Xibo API responses are cached with TTLs (5s for settings, 30s for API). Mutations invalidate relevant cache prefixes.

### HTTP Responses

- **Helper functions, not raw `new Response()`** — Use `htmlResponse()`, `redirect()`, `redirectWithSuccess()`, `notFoundResponse()`, `withCookie()`, `htmlResponseWithCookie()` from `#routes/utils.ts`.
- **Security headers on every response** — `getSecurityHeaders()` adds `X-Content-Type-Options`, `Referrer-Policy`, `X-Robots-Tag`, `X-Frame-Options`, and a strict CSP header.

### Templates

- **JSX for HTML generation** — Templates are `.tsx` files using React JSX syntax (custom `#jsx` runtime). They return `string` via `String(<Component />)`. No template literals for HTML.
- **Declarative form field definitions** — Forms are defined as `Field[]` arrays in `templates/fields.ts` and rendered by the form framework, not hand-coded HTML.

### Testing

- **Jest-like API via `#test-compat`** — Import `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `jest.fn()`, `spyOn()` from `#test-compat`, not from Deno's stdlib.
- **Shared test utilities from `#test-utils`** — Use `mockRequest()`, `mockFormRequest()`, `createTestDb()`, `createTestDbWithSetup()`, `loginAsAdmin()`, `resetDb()`. Never define local duplicates.
- **`resetDb()` in every `afterEach`** — Tests must clean up database state. The `lazyRef` pattern makes `setDb(null)` reset the connection.

### Error Handling

- **Classified error codes** — All errors use codes from `ErrorCode` in `#lib/logger.ts` (e.g., `E_DB_CONNECTION`, `E_XIBO_API_AUTH`). Log via `logError({ code, detail })`, never raw `console.error`.
- **Privacy-safe logging** — Never log PII, tokens, or passwords. Error details describe the *situation*, not the *data*.
- **Xibo client errors** — API failures throw `XiboClientError` with an `httpStatus` property. 401s trigger one automatic re-auth + retry before failing.

### Naming Conventions

- **Functions**: verb-first — `handleAdminLogin()`, `createRouter()`, `getDb()`, `isValidDomain()`, `loadXiboConfig()`
- **Constants**: `SCREAMING_SNAKE_CASE` — `LATEST_UPDATE`, `SETTINGS_CACHE_TTL_MS`, `TOKEN_EXPIRY_MARGIN_MS`
- **Constants grouped in objects**: `CONFIG_KEYS.SETUP_COMPLETE`, `ErrorCode.AUTH_INVALID_SESSION`
- **Files**: kebab-case — `login-attempts.ts`, `test-compat.ts`
- **Types**: PascalCase — `AdminSession`, `RouteParams`, `ValidationResult<T>`
