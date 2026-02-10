# Xibo Scripts: Bunny Edge Script Migration Plan

## Overview

Migrate xibo-scripts from a Ruby CLI + Rails web app into a **Bunny Edge Script** (TypeScript/Deno), reusing the infrastructure from the [tickets](https://github.com/chobbledotcom/tickets/) repository.

### Current State (Ruby)

- **CLI**: 23 commands across 6 categories (media, menuboard, category, product, layout, dataset)
- **Web UI**: Rails 8.1 with HAML templates, SQLite, tabbed interface
- **API Client**: HTTParty-based OAuth2 client with swagger.json validation
- **Caching**: File-based JSON cache in `/tmp/cache/`
- **Testing**: RSpec with webmock
- **Deployment**: Docker multi-stage build

### Target State (TypeScript/Deno)

- **Runtime**: Bunny Edge Scripting (Deno-based, runs on CDN edge)
- **Database**: libsql (Turso) with encrypted settings
- **Templates**: Server-rendered JSX (custom runtime, no client React)
- **Build**: esbuild to single JavaScript file for Bunny deployment
- **Testing**: Deno test runner with Jest-like compatibility layer, 100% coverage required

### What We Reuse from Tickets (as-is or with minimal adaptation)

| Component | Source | Notes |
|-----------|--------|-------|
| Database encryption | `src/lib/crypto.ts` | AES-256-GCM, PBKDF2, key hierarchy |
| User auth system | `src/lib/db/users.ts` | Login, invite flow, password hashing |
| Admin layout | `src/templates/admin/` | Nav, base layout, JSX templates |
| Form infrastructure | `src/lib/forms.tsx` | Declarative fields, validation, rendering |
| CSRF protection | `src/routes/utils.ts` | Double-submit cookie pattern |
| Session management | `src/lib/db/sessions.ts` | Cookie-based, encrypted, 24hr TTL |
| First-time setup | `src/routes/setup.ts` | Wizard flow (adapted for Xibo config) |
| CSS | `src/static/mvp.css` | MVP.css v1.17.2 (classless) |
| Test infrastructure | `src/test-utils/`, `#test-compat` | Jest-like API on Deno |
| FP utilities | `src/fp/index.ts` | pipe, filter, map, reduce, etc. |
| jscpd config | `.jscpd.json` | 0% duplication threshold |
| Deno config | `deno.json` | Import maps, tasks, strict TS |
| Biome config | `biome.json` | Linter rules (no forEach, no var, etc.) |
| Router | `src/routes/router.ts` | Declarative pattern matching |
| Middleware | `src/routes/middleware.ts` | Security headers, domain validation |
| Logger | `src/lib/logger.ts` | Privacy-safe request logging |
| JSX runtime | `src/lib/jsx/` | Server-side JSX rendering |
| Build script | `scripts/build-edge.ts` | esbuild bundler for Bunny |
| CSS minifier | `scripts/css-minify.ts` | Build-time CSS minification |
| DB client | `src/lib/db/client.ts` | libsql connection with auto-migration |
| DB migrations | `src/lib/db/migrations/` | Schema management |

### What We Strip (ticket-specific code)

- Events, attendees, check-in, QR codes
- Stripe/Square payment integration
- Public ticket booking routes
- Payment webhook routes
- Calendar/holidays
- Ticket view routes

### What We Build New

- Xibo API client (OAuth2 client credentials, token refresh)
- Menu board management (boards, categories, products)
- Media library management (list, upload, delete)
- Layout builder (auto-generate 1080x1920 portrait layouts)
- Dataset operations
- Xibo-specific admin UI pages
- Xibo-specific settings (API URL, client ID, client secret)

## Parts

- [Part 1: Base Infrastructure](PLAN_PART_1.md) - Project skeleton, auth, sessions, setup wizard, admin layout
- [Part 2: Xibo API Client & Connection](PLAN_PART_2.md) - OAuth2 client, caching, settings page
- [Part 3: Menu Board Management](PLAN_PART_3.md) - Board/category/product CRUD, tree view
- [Part 4: Media Library Management](PLAN_PART_4.md) - Browse, upload, delete media files
- [Part 5: Layout Builder & Datasets](PLAN_PART_5.md) - Auto-generate layouts, dataset browser
- [Part 6: Polish, CI/CD & Deployment](PLAN_PART_6.md) - 100% coverage, CI/CD, deployment

## Dependency Graph

```
Chunk 1 (Infrastructure)
    |
Chunk 2 (Xibo API Client)
    |
Chunk 3 (Menu Boards) <-> Chunk 4 (Media Library)
    |                         |
Chunk 5 (Layouts & Datasets)
    |
Chunk 6 (Polish & Deploy)
```

Chunks 3 and 4 can be worked on in parallel since they're independent feature areas that both depend on Chunk 2's API client. Chunk 5 depends on both (layouts reference menu boards, and media is used in products/layouts).

## File Structure (Target)

```
xibo-scripts/
├── src/
│   ├── config/                     # Asset path configuration
│   ├── edge/                       # Bunny Edge entry point
│   │   └── index.ts
│   ├── fp/                         # FP utilities (from tickets, as-is)
│   │   └── index.ts
│   ├── lib/
│   │   ├── db/                     # Database layer
│   │   │   ├── client.ts           # libsql connection
│   │   │   ├── migrations/         # Schema & auto-migration
│   │   │   ├── sessions.ts         # Session CRUD
│   │   │   ├── settings.ts         # Settings CRUD (Xibo config)
│   │   │   └── users.ts            # User CRUD (auth, invites)
│   │   ├── jsx/                    # Server-side JSX runtime
│   │   ├── rest/                   # REST utilities
│   │   ├── xibo/                   # Xibo API integration (NEW)
│   │   │   ├── client.ts           # OAuth2 HTTP client
│   │   │   ├── cache.ts            # Response caching
│   │   │   ├── layout-builder.ts   # Auto layout generation
│   │   │   └── types.ts            # Xibo API type definitions
│   │   ├── config.ts               # Runtime config
│   │   ├── crypto.ts               # Encryption (from tickets)
│   │   ├── forms.tsx               # Form framework (from tickets)
│   │   ├── logger.ts               # Request logging
│   │   ├── now.ts                  # Timestamp utility
│   │   └── types.ts                # App type definitions
│   ├── routes/
│   │   ├── admin/
│   │   │   ├── auth.ts             # Login/logout
│   │   │   ├── dashboard.ts        # Admin home
│   │   │   ├── datasets.ts         # Dataset browser (NEW)
│   │   │   ├── index.ts            # Admin route aggregator
│   │   │   ├── layouts.ts          # Layout management (NEW)
│   │   │   ├── media.ts            # Media management (NEW)
│   │   │   ├── menuboards.ts       # Menu board CRUD (NEW)
│   │   │   ├── sessions.ts         # Session management
│   │   │   ├── settings.ts         # Xibo API settings (NEW)
│   │   │   ├── users.ts            # User/invite management
│   │   │   └── utils.ts            # Admin route helpers
│   │   ├── index.ts                # Main request dispatcher
│   │   ├── middleware.ts           # Security headers, validation
│   │   ├── router.ts              # Declarative pattern matching
│   │   ├── setup.ts               # First-time setup wizard
│   │   ├── static.ts              # Static asset serving
│   │   ├── types.ts               # Route types
│   │   └── utils.ts               # CSRF, auth, response helpers
│   ├── static/
│   │   ├── admin.js               # Admin page behaviors
│   │   ├── favicon.svg            # App icon
│   │   └── mvp.css                # MVP.css framework
│   ├── templates/
│   │   ├── admin/
│   │   │   ├── dashboard.tsx       # Admin dashboard
│   │   │   ├── datasets.tsx        # Dataset pages (NEW)
│   │   │   ├── layouts.tsx         # Layout pages (NEW)
│   │   │   ├── login.tsx           # Login form
│   │   │   ├── media.tsx           # Media pages (NEW)
│   │   │   ├── menuboards.tsx      # Menu board pages (NEW)
│   │   │   ├── nav.tsx             # Navigation menu
│   │   │   ├── sessions.tsx        # Session management
│   │   │   ├── settings.tsx        # Xibo API settings (NEW)
│   │   │   └── users.tsx           # User management
│   │   ├── fields.ts              # Form field definitions
│   │   ├── layout.tsx             # Base HTML layout
│   │   └── setup.tsx              # Setup wizard
│   ├── test-utils/
│   │   ├── index.ts               # Test helpers
│   │   └── test-compat.ts         # Jest-like API
│   └── index.ts                   # Server entry point
├── test/
│   └── lib/                       # Tests mirroring src/ structure
├── scripts/
│   ├── build-edge.ts              # esbuild bundler
│   ├── css-minify.ts              # CSS minification
│   ├── run-tests.ts               # Test runner
│   └── profile-cold-boot.ts       # Performance profiling
├── .github/
│   └── workflows/
│       ├── test.yml               # CI test pipeline
│       └── deploy.yml             # Bunny Edge deployment
├── .gitignore
├── .jscpd.json                    # Duplication detection
├── biome.json                     # Linter config
├── CLAUDE.md                      # Developer guide
├── deno.json                      # Deno config
├── PLAN.md                        # This file
└── README.md                      # Project documentation
```

## Part 1 Completion Status

Part 1 (Base Infrastructure) is **complete**. All files listed in the "What We Reuse from Tickets" table have been adapted and created. 171 tests pass covering FP, env, now, JSX runtime, logger, crypto, and forms.

## Learnings for Future Agents

### Copying from Tickets Repo

1. **Clone tickets first**: `git clone` the tickets repo to `/tmp/tickets` for reference. Read files from there, don't try to copy blindly — every file needs adaptation.

2. **Key adaptation points when copying from tickets**:
   - `src/lib/db/settings.ts`: The `completeSetup()` function signature changes. Tickets takes `(username, password, currency)`, xibo-scripts takes `(username, password, xiboApiUrl, xiboClientId, xiboClientSecret)`. All setup-related tests and routes cascade from this change.
   - `src/templates/fields.ts`: Replace ticket-specific form types (EventFormValues, TicketFormValues, etc.) with Xibo-specific types (SetupFormValues with xibo_api_url/client_id/client_secret, XiboCredentialsFormValues).
   - `src/templates/admin/nav.tsx`: Navigation links change from Events/Calendar/Attendees to Menu Boards/Media/Layouts/Datasets.
   - `src/templates/admin/dashboard.tsx`: Quick links change accordingly.
   - `src/routes/setup.ts`: The setup form validation and `completeSetup` call changes.
   - `src/routes/admin/settings.ts`: Replace Stripe/Square credentials forms with Xibo credentials.
   - `src/lib/logger.ts`: ErrorCodes replace STRIPE_*/SQUARE_*/CAPACITY_* with XIBO_API_*.
   - `scripts/build-edge.ts`: Remove stripe/square/qrcode from externals and esm.sh rewrites.
   - `scripts/run-tests.ts`: Remove stripe-mock dependency entirely.

3. **Files that copy nearly as-is** (minimal changes):
   - `src/fp/index.ts` — exact copy
   - `src/lib/crypto.ts` — exact copy (except remove `generateTicketToken`)
   - `src/lib/env.ts` — exact copy
   - `src/lib/now.ts` — exact copy
   - `src/lib/db/client.ts` — exact copy
   - `src/lib/db/sessions.ts` — exact copy
   - `src/lib/db/login-attempts.ts` — exact copy
   - `src/lib/db/activityLog.ts` — exact copy
   - `src/lib/db/users.ts` — exact copy
   - `src/lib/jsx/jsx-runtime.ts` — exact copy
   - `src/lib/forms.tsx` — exact copy
   - `src/routes/router.ts` — exact copy
   - `src/routes/middleware.ts` — exact copy
   - `src/routes/utils.ts` — exact copy
   - `src/routes/types.ts` — exact copy
   - `src/routes/health.ts` — exact copy
   - `src/routes/assets.ts` — exact copy
   - `src/routes/static.ts` — exact copy
   - `src/routes/admin/auth.ts` — exact copy
   - `src/routes/admin/utils.ts` — exact copy
   - `src/routes/admin/sessions.ts` — exact copy
   - `src/static/mvp.css` — exact copy
   - `src/static/admin.js` — exact copy
   - `biome.json`, `.jscpd.json`, `setup.sh` — exact copy
   - `scripts/css-minify.ts` — exact copy
   - `src/test-utils/test-compat.ts` — modified (see below)

### Environment & Dependencies

4. **JSR packages may be unreachable**: The `jsr:@std/assert` import in `test-compat.ts` fails in some CI/sandbox environments. The adapted version uses `node:assert/strict` instead, which is always available in Deno. This is a **critical change** — without it, no tests run.

5. **npm packages require network access**: `@libsql/client` is an npm package that needs to be downloaded. In environments without npm registry access, tests that touch the database layer won't work. Structure test helpers so crypto-only helpers live in a separate file (`src/test-utils/crypto-helpers.ts`) that doesn't import `@libsql/client`.

6. **Test-compat.ts reimplementation**: The `test-compat.ts` Jest-like API was rewritten to use `node:assert/strict` instead of `jsr:@std/assert`. Key mappings:
   - `assert` → `nodeAssert.ok`
   - `assertEquals` → `nodeAssert.deepStrictEqual`
   - `assertStrictEquals` → `nodeAssert.strictEqual`
   - `assertMatch` → `nodeAssert.match`
   - `assertThrows` / `assertRejects` → manual try/catch implementations

### Architecture Notes

7. **Lazy loading pattern**: Routes use `once()` from FP utilities for lazy initialization. This optimizes cold boot on Bunny Edge where each request is a fresh isolate.

8. **Key hierarchy**: The encryption system uses a 3-level key hierarchy:
   - `DB_ENCRYPTION_KEY` (env var) → encrypts settings at rest
   - Per-user `KEK` (derived from password hash) → wraps the data key
   - `DATA_KEY` (random AES key) → encrypts user-specific data
   - Session tokens can also wrap the data key via `wrapKeyWithToken`/`unwrapKeyWithToken`

9. **Test performance**: Use `TEST_PBKDF2_ITERATIONS=1` in test environment (set by `setupTestEncryptionKey()`) to avoid slow PBKDF2 iterations. Also `TEST_RSA_KEY_SIZE=1024` for faster key generation in tests.

10. **Import maps**: All local imports use `#` prefixed aliases defined in `deno.json`. This is critical for the esbuild bundler which resolves these during the build step.

### What Part 2 Needs to Build

11. **Xibo API client** (`src/lib/xibo/client.ts`): OAuth2 client credentials flow. The Xibo CMS API uses a standard OAuth2 token endpoint at `{base_url}/api/authorize/access_token`. Store the token in memory with expiry tracking.

12. **Admin routes for Xibo entities**: The nav already links to `/admin/menuboards`, `/admin/media`, `/admin/layouts`, `/admin/datasets` — but these routes don't exist yet. Part 2 should create the Xibo API client and connection test page. Parts 3-5 build the actual entity management pages.
