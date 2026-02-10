# Part 1: Base Infrastructure

**Goal**: A working Bunny Edge Script skeleton that boots, shows a setup page, lets you create an admin account, and login to an empty admin dashboard.

**Depends on**: Nothing (this is the foundation)

---

## 1.1 Project Skeleton

- Copy `deno.json` from tickets, rename to `xibo-scripts`, update version
- Copy `biome.json` as-is
- Copy `.jscpd.json` as-is
- Copy `tsconfig.json` compiler options (already in deno.json)
- Remove all ticket-specific npm dependencies (stripe, square, qrcode)
- Keep: `@libsql/client`, `esbuild`, `@bunny.net/edgescript-sdk`, `@std/assert`, `@std/path`
- Update import maps: keep all `#` aliases, remove ticket-specific ones
- Create `setup.sh` script (install Deno, cache deps, run precommit)

## 1.2 FP Utilities

- Copy `src/fp/index.ts` exactly as-is
- All functions: `pipe`, `filter`, `map`, `flatMap`, `reduce`, `sort`, `sortBy`, `unique`, `uniqueBy`, `compact`, `groupBy`, `memoize`, `once`, `lazyRef`, `pick`, `isDefined`, `identity`, `pipeAsync`, `mapAsync`, `ok`, `err`, `bracket`
- Copy existing tests for fp/

## 1.3 Crypto & Encryption

- Copy `src/lib/crypto.ts` exactly as-is
- All functions: `encrypt`, `decrypt`, `encryptWithKey`, `hashPassword`, `verifyPassword`, `generateDataKey`, `generateKeyPair`, `deriveKEK`, `wrapKey`, `unwrapKey`, `constantTimeEqual`, `generateSecureToken`, `hmacHash`
- Copy existing crypto tests

## 1.4 Database Layer

- Copy `src/lib/db/client.ts` (libsql connection, auto-migration)
- Copy `src/lib/db/migrations/` schema infrastructure
- Create new migration schema adapted for xibo:
  - `settings` table (key/value, same as tickets)
  - `users` table (same as tickets: encrypted username, password hash, admin level, wrapped data key)
  - `sessions` table (same as tickets: hashed token, csrf, wrapped data key, expiry)
  - `login_attempts` table (same as tickets: rate limiting)
  - `activity_log` table (same as tickets: audit trail)
  - Drop: `events`, `attendees`, `processed_payments`, `holidays` tables
- Copy `src/lib/db/sessions.ts` as-is (create, get, delete, cache)
- Copy `src/lib/db/users.ts` as-is (create, lookup by HMAC blind index, invite flow)
- Adapt `src/lib/db/settings.ts`:
  - Keep: `getSetting`, `setSetting`, `isSetupComplete`, `completeSetup` (core), settings cache
  - Replace: Stripe/Square config keys with Xibo API config keys:
    - `XIBO_API_URL` - Xibo CMS URL (encrypted)
    - `XIBO_CLIENT_ID` - OAuth2 client ID (encrypted)
    - `XIBO_CLIENT_SECRET` - OAuth2 client secret (encrypted)
  - Add: `getXiboApiUrl()`, `getXiboClientId()`, `getXiboClientSecret()`, `updateXiboCredentials()`
  - Remove: All Stripe/Square/embed host functions

## 1.5 JSX Runtime & Templates

- Copy `src/lib/jsx/` directory as-is (custom server-side JSX runtime)
- Copy `src/templates/layout.tsx` (base HTML layout with MVP.css)
- Adapt the layout for "Xibo Scripts" branding
- Copy `src/templates/admin/nav.tsx`, adapt navigation links:
  - Dashboard
  - Menu Boards
  - Media
  - Layouts
  - Datasets
  - Settings
  - Sessions
  - Users
  - Logout
- Copy `src/templates/admin/login.tsx` as-is
- Create `src/templates/admin/dashboard.tsx` with empty placeholder content
- Copy `src/templates/setup.tsx`, adapt:
  - Fields: admin username, password, password confirm, Xibo API URL, Xibo client ID, Xibo client secret
  - Remove: currency code, Data Controller Agreement
  - Add: Xibo connection test on setup completion

## 1.6 Form Infrastructure

- Copy `src/lib/forms.tsx` as-is (field definitions, rendering, validation)
- Adapt `src/templates/fields.ts`:
  - Create `setupFields` for Xibo setup (username, password, API URL, client ID, client secret)
  - Create `loginFields` (same as tickets: username, password)
  - Remove: event fields, attendee fields

## 1.7 Routes & Middleware

- Copy `src/routes/router.ts` as-is (declarative pattern matching)
- Copy `src/routes/middleware.ts` as-is (security headers, domain validation, content-type)
- Copy `src/routes/utils.ts` as-is (CSRF, auth helpers, response helpers, cookie parsing)
- Copy `src/routes/types.ts` as-is (ServerContext type)
- Copy `src/routes/static.ts` as-is (serve CSS, favicon)
- Adapt `src/routes/index.ts`:
  - Keep: static routes, setup routes, admin route prefix
  - Replace lazy-loaded routes: remove ticket/payment/join/checkin, add menuboard/media/layout/dataset
  - Keep: domain validation, security headers, request logging
- Copy `src/routes/setup.ts`, adapt for Xibo setup fields
- Copy `src/routes/admin/auth.ts` as-is (login/logout)
- Copy `src/routes/admin/dashboard.ts`, adapt to show Xibo status
- Copy `src/routes/admin/sessions.ts` as-is (view/kill sessions)
- Copy `src/routes/admin/users.ts` as-is (invite managers, remove users)
- Create empty placeholder files for: `src/routes/admin/menuboards.ts`, `src/routes/admin/media.ts`, `src/routes/admin/layouts.ts`, `src/routes/admin/datasets.ts`

## 1.8 Static Assets & Config

- Copy `src/static/mvp.css` as-is
- Copy `src/static/favicon.svg` or create a new one
- Copy `src/static/admin.js`, adapt for Xibo UI needs
- Copy `src/config/` (asset paths)
- Copy `src/lib/config.ts` (runtime config loading)
- Copy `src/lib/logger.ts` as-is
- Copy `src/lib/types.ts`, adapt type definitions
- Copy `src/lib/now.ts` as-is (timestamp utility)

## 1.9 Build & Scripts

- Copy `scripts/build-edge.ts` as-is (esbuild bundler)
- Copy `scripts/css-minify.ts` as-is
- Copy `scripts/run-tests.ts` as-is (test runner with coverage)
- Copy `scripts/profile-cold-boot.ts` as-is

## 1.10 Test Infrastructure

- Copy `src/test-utils/index.ts` as-is (mock helpers, test DB setup)
- Copy `src/test-utils/test-compat.ts` as-is (Jest-like API)
- Adapt `createTestDbWithSetup()` for Xibo schema
- Write tests for:
  - Setup flow (GET/POST /setup, CSRF validation)
  - Login/logout
  - Session creation/validation/expiry
  - Admin dashboard (empty state)
  - Middleware (security headers, domain rejection)

## 1.11 Entry Point

- Copy `src/index.ts` as-is (server startup, handleRequest export)
- Adapt `src/edge/index.ts` for Bunny edge entry point

## 1.12 Cleanup

- Remove all Ruby files: `*.rb`, `Gemfile`, `Rakefile`, `spec/`, `xibo_web/`, `cli/`, `bin/`
- Remove Ruby config: `.rspec`, `Dockerfile` (replace later), `flake.nix`, `flake.lock`
- Remove: `swagger.json`, `background.jpg`, `background.krz`
- Keep: `.github/` (adapt workflows), `.gitignore` (update for Deno), `README.md` (rewrite)
- Update `.gitignore` for Deno/TypeScript project

## Expected Outcome

Run `deno task start` -> server boots -> navigate to `/setup` -> create admin account with Xibo API credentials -> redirected to `/admin` -> see empty dashboard with navigation. Login/logout works. Sessions work. All infrastructure tests pass.
