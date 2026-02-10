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
