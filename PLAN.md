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

---

## Chunk 1: Base Infrastructure

**Goal**: A working Bunny Edge Script skeleton that boots, shows a setup page, lets you create an admin account, and login to an empty admin dashboard.

### 1.1 Project Skeleton

- Copy `deno.json` from tickets, rename to `xibo-scripts`, update version
- Copy `biome.json` as-is
- Copy `.jscpd.json` as-is
- Copy `tsconfig.json` compiler options (already in deno.json)
- Remove all ticket-specific npm dependencies (stripe, square, qrcode)
- Keep: `@libsql/client`, `esbuild`, `@bunny.net/edgescript-sdk`, `@std/assert`, `@std/path`
- Update import maps: keep all `#` aliases, remove ticket-specific ones
- Create `setup.sh` script (install Deno, cache deps, run precommit)

### 1.2 FP Utilities

- Copy `src/fp/index.ts` exactly as-is
- All functions: `pipe`, `filter`, `map`, `flatMap`, `reduce`, `sort`, `sortBy`, `unique`, `uniqueBy`, `compact`, `groupBy`, `memoize`, `once`, `lazyRef`, `pick`, `isDefined`, `identity`, `pipeAsync`, `mapAsync`, `ok`, `err`, `bracket`
- Copy existing tests for fp/

### 1.3 Crypto & Encryption

- Copy `src/lib/crypto.ts` exactly as-is
- All functions: `encrypt`, `decrypt`, `encryptWithKey`, `hashPassword`, `verifyPassword`, `generateDataKey`, `generateKeyPair`, `deriveKEK`, `wrapKey`, `unwrapKey`, `constantTimeEqual`, `generateSecureToken`, `hmacHash`
- Copy existing crypto tests

### 1.4 Database Layer

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

### 1.5 JSX Runtime & Templates

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

### 1.6 Form Infrastructure

- Copy `src/lib/forms.tsx` as-is (field definitions, rendering, validation)
- Adapt `src/templates/fields.ts`:
  - Create `setupFields` for Xibo setup (username, password, API URL, client ID, client secret)
  - Create `loginFields` (same as tickets: username, password)
  - Remove: event fields, attendee fields

### 1.7 Routes & Middleware

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

### 1.8 Static Assets & Config

- Copy `src/static/mvp.css` as-is
- Copy `src/static/favicon.svg` or create a new one
- Copy `src/static/admin.js`, adapt for Xibo UI needs
- Copy `src/config/` (asset paths)
- Copy `src/lib/config.ts` (runtime config loading)
- Copy `src/lib/logger.ts` as-is
- Copy `src/lib/types.ts`, adapt type definitions
- Copy `src/lib/now.ts` as-is (timestamp utility)

### 1.9 Build & Scripts

- Copy `scripts/build-edge.ts` as-is (esbuild bundler)
- Copy `scripts/css-minify.ts` as-is
- Copy `scripts/run-tests.ts` as-is (test runner with coverage)
- Copy `scripts/profile-cold-boot.ts` as-is

### 1.10 Test Infrastructure

- Copy `src/test-utils/index.ts` as-is (mock helpers, test DB setup)
- Copy `src/test-utils/test-compat.ts` as-is (Jest-like API)
- Adapt `createTestDbWithSetup()` for Xibo schema
- Write tests for:
  - Setup flow (GET/POST /setup, CSRF validation)
  - Login/logout
  - Session creation/validation/expiry
  - Admin dashboard (empty state)
  - Middleware (security headers, domain rejection)

### 1.11 Entry Point

- Copy `src/index.ts` as-is (server startup, handleRequest export)
- Adapt `src/edge/index.ts` for Bunny edge entry point

### 1.12 Cleanup

- Remove all Ruby files: `*.rb`, `Gemfile`, `Rakefile`, `spec/`, `xibo_web/`, `cli/`, `bin/`
- Remove Ruby config: `.rspec`, `Dockerfile` (replace later), `flake.nix`, `flake.lock`
- Remove: `swagger.json`, `background.jpg`, `background.krz`
- Keep: `.github/` (adapt workflows), `.gitignore` (update for Deno), `README.md` (rewrite)
- Update `.gitignore` for Deno/TypeScript project

### Expected Outcome

Run `deno task start` → server boots → navigate to `/setup` → create admin account with Xibo API credentials → redirected to `/admin` → see empty dashboard with navigation. Login/logout works. Sessions work. All infrastructure tests pass.

---

## Chunk 2: Xibo API Client & Connection

**Goal**: A TypeScript Xibo API client that authenticates via OAuth2, makes API calls, and is configurable through the admin settings page.

### 2.1 Xibo API Client (`src/lib/xibo/client.ts`)

- OAuth2 client credentials flow:
  - `POST /api/authorize/access_token` with `grant_type=client_credentials`
  - Store access token in memory (not DB - it's short-lived)
  - Auto-refresh on 401 responses (re-authenticate and retry once)
- HTTP methods:
  - `get(endpoint, params?)` - GET with query string
  - `post(endpoint, body?)` - POST with JSON body
  - `put(endpoint, body?)` - PUT with JSON body
  - `del(endpoint)` - DELETE
  - `postMultipart(endpoint, formData)` - File uploads
- All methods:
  - Include `Authorization: Bearer {token}` header
  - Parse JSON responses
  - Handle errors with typed error objects
  - Log requests (method, endpoint, status, duration)
- Configuration loaded from encrypted DB settings (API URL, client ID, client secret)
- Use `once()` / `lazyRef()` patterns from `#fp` for client initialization

### 2.2 Response Caching (`src/lib/xibo/cache.ts`)

- In-memory cache with TTL (e.g., 30 seconds for list operations)
- Cache keys based on endpoint + params
- Automatic invalidation on mutations (POST/PUT/DELETE → invalidate related GET caches)
- `invalidateAll()` for manual cache clear
- Cache strategy:
  - `menuboards` → cached, invalidated on board mutations
  - `categories_{boardId}` → cached, invalidated on category mutations
  - `products_{categoryId}` → cached, invalidated on product mutations
  - `library` → cached, invalidated on media mutations
  - `layout` → cached, invalidated on layout mutations
  - `dataset` → cached, invalidated on dataset mutations

### 2.3 Xibo API Types (`src/lib/xibo/types.ts`)

- TypeScript interfaces for all Xibo API entities:
  - `XiboMenuBoard` (menuBoardId, name, code, description, modifiedDt)
  - `XiboCategory` (menuCategoryId, menuId, name, code, mediaId)
  - `XiboProduct` (menuProductId, menuCategoryId, name, price, calories, allergyInfo, availability, description, mediaId)
  - `XiboMedia` (mediaId, name, mediaType, storedAs, fileSize, duration, tags, folderId)
  - `XiboFolder` (folderId, text, parentId, children)
  - `XiboLayout` (layoutId, layout, description, status, width, height, publishedStatusId)
  - `XiboRegion` (regionId, width, height, top, left, zIndex)
  - `XiboWidget` (widgetId, type, displayOrder)
  - `XiboDataset` (dataSetId, dataSet, description, code, columns, rows)
  - `XiboResolution` (resolutionId, resolution, width, height)
  - `XiboAuthToken` (access_token, token_type, expires_in)
  - `XiboApiError` (httpStatus, message)

### 2.4 Admin Settings Page (`src/routes/admin/settings.ts`)

- `GET /admin/settings` - Show settings form with current Xibo API configuration
  - Display connection status (connected/disconnected/error)
  - Fields: API URL, Client ID, Client Secret (masked)
  - "Test Connection" button
  - "Save" button
- `POST /admin/settings` - Update Xibo API credentials
  - Validate URL format
  - Encrypt and store credentials
  - Test connection after save
  - Show success/error message
- `POST /admin/settings/test` - Test Xibo API connection
  - Attempt OAuth2 authentication
  - Return success/failure with error details
- Admin settings template: `src/templates/admin/settings.tsx`
- Settings fields definition in `src/templates/fields.ts`

### 2.5 Dashboard Integration

- Update `src/routes/admin/dashboard.ts`:
  - Show Xibo API connection status
  - Show Xibo CMS version (from API response headers)
  - Show count of menu boards, media items, layouts (if connected)
  - Show "Configure Xibo API" prompt if not connected
- Update `src/templates/admin/dashboard.tsx` accordingly

### 2.6 Tests

- Xibo client tests (mock HTTP responses):
  - Authentication flow (success, failure, token refresh)
  - GET/POST/PUT/DELETE operations
  - Error handling (network errors, 4xx, 5xx)
  - Multipart upload
- Cache tests:
  - Cache hit/miss, TTL expiry, invalidation
- Settings tests:
  - Save/load encrypted credentials
  - Connection test
  - Settings page rendering

### Expected Outcome

Admin can configure Xibo API credentials in settings. Dashboard shows connection status. API client authenticates and is ready for use by subsequent chunks.

---

## Chunk 3: Menu Board Management

**Goal**: Full CRUD for the core menu board hierarchy (boards, categories, products) through the admin web UI.

### 3.1 Menu Board Routes (`src/routes/admin/menuboards.ts`)

**Board operations**:
- `GET /admin/menuboards` - List all menu boards in a table
- `GET /admin/menuboard/new` - New board form
- `POST /admin/menuboard` - Create a new menu board
- `GET /admin/menuboard/:id` - View board detail (with categories tree)
- `GET /admin/menuboard/:id/edit` - Edit board form (pre-filled)
- `POST /admin/menuboard/:id` - Update board
- `POST /admin/menuboard/:id/delete` - Delete board (with confirmation)

**Category operations** (nested under boards):
- `GET /admin/menuboard/:boardId/category/new` - New category form
- `POST /admin/menuboard/:boardId/category` - Create category
- `GET /admin/menuboard/:boardId/category/:id/edit` - Edit category form
- `POST /admin/menuboard/:boardId/category/:id` - Update category
- `POST /admin/menuboard/:boardId/category/:id/delete` - Delete category

**Product operations** (nested under categories):
- `GET /admin/menuboard/:boardId/category/:catId/product/new` - New product form
- `POST /admin/menuboard/:boardId/category/:catId/product` - Create product
- `GET /admin/menuboard/:boardId/category/:catId/product/:id/edit` - Edit product form
- `POST /admin/menuboard/:boardId/category/:catId/product/:id` - Update product
- `POST /admin/menuboard/:boardId/category/:catId/product/:id/delete` - Delete product

### 3.2 Menu Board Templates (`src/templates/admin/menuboards.tsx`)

- **Board list page**: Table with name, code, description, category count, actions (view/edit/delete)
- **Board detail page**: Board info + tree view of categories → products, with add/edit/delete links
- **Board form** (new/edit): Fields for name, code, description
- **Category form** (new/edit): Fields for name, code, media selection
- **Product form** (new/edit): Fields for:
  - Name (text, required)
  - Description (textarea)
  - Price (number, required)
  - Calories (number)
  - Allergy info (text)
  - Availability (checkbox/toggle)
  - Media (select from library)
- **Tree view component**: Hierarchical display of board → categories → products
  - Collapsible sections
  - Inline action links (edit, delete)
  - Product details shown inline (price, availability)

### 3.3 Form Field Definitions (`src/templates/fields.ts`)

- `menuBoardFields`: name (text, required), code (text), description (textarea)
- `categoryFields`: name (text, required), code (text), mediaId (select)
- `productFields`: name (text, required), description (textarea), price (number, required), calories (number), allergyInfo (text), availability (checkbox, default: true), mediaId (select)

### 3.4 Xibo API Integration

- Menu board API calls via `src/lib/xibo/client.ts`:
  - `GET /api/menuboards` → list boards
  - `POST /api/menuboards` → create board (body: name, code, description)
  - `PUT /api/menuboards/{id}` → update board
  - `DELETE /api/menuboards/{id}` → delete board
  - `GET /api/menuboard/{id}/category` → list categories
  - `POST /api/menuboard/{id}/category` → create category
  - `PUT /api/menuboard/{id}/category/{catId}` → update category
  - `DELETE /api/menuboard/{id}/category/{catId}` → delete category
  - `GET /api/menuboard/{boardId}/product` → list products (filter by category)
  - `POST /api/menuboard/{boardId}/product` → create product
  - `PUT /api/menuboard/{boardId}/product/{prodId}` → update product
  - `DELETE /api/menuboard/{boardId}/product/{prodId}` → delete product
- Parameter conversion: form field names (snake_case) → API field names (camelCase)
  - `allergy_info` → `allergyInfo`
  - `menu_id` → `menuId`
  - `media_id` → `mediaId`
  - etc.

### 3.5 Activity Logging

- Log all menu board operations to activity_log table:
  - Created board "X"
  - Updated category "Y" in board "X"
  - Deleted product "Z" from category "Y"
- Show recent activity on board detail page

### 3.6 Tests

- Route tests for all CRUD operations (mock Xibo API):
  - List boards (empty, with data)
  - Create board (success, validation errors, API errors)
  - Edit board (pre-fill form, save changes)
  - Delete board (confirmation, success)
  - Same for categories and products
- Template rendering tests (verify HTML output)
- Parameter conversion tests (snake_case ↔ camelCase)
- Tree view component tests

### Expected Outcome

Full menu board management through the web UI. Can list, create, edit, delete boards, categories, and products. Tree view shows the hierarchy. All operations go through the Xibo API.

---

## Chunk 4: Media Library Management

**Goal**: Browse, upload, and manage media files in the Xibo CMS from the web UI.

### 4.1 Media Routes (`src/routes/admin/media.ts`)

- `GET /admin/media` - List all media with folder hierarchy
  - Query params: `folderId` (filter by folder), `type` (filter by media type)
  - Display: name, type, file size, dimensions, folder, actions
- `GET /admin/media/upload` - Upload form
- `POST /admin/media/upload` - Upload media file
  - Accept multipart form data (file + name + folderId)
  - Forward to Xibo API as multipart upload
  - Show success with media details
- `POST /admin/media/upload-url` - Upload media from URL
  - Fields: URL, name, folderId
  - Download image from URL, then upload to Xibo
  - Handle filename conflicts
- `GET /admin/media/:id` - View media details
  - Show: name, type, size, dimensions, tags, folder, created/modified dates
  - Preview image (if image type) via Xibo library download endpoint
- `POST /admin/media/:id/delete` - Delete media with confirmation

### 4.2 Media Templates (`src/templates/admin/media.tsx`)

- **Media list page**:
  - Folder sidebar/breadcrumbs showing hierarchy
  - Media table: name, type icon, size (human-readable), folder, actions
  - Filter controls: by folder, by type (image, video, font, etc.)
  - "Upload" button
- **Upload form**:
  - File input (drag-and-drop area if possible with JS)
  - Name field (auto-populated from filename)
  - Folder selection dropdown
  - Submit button
- **Upload from URL form**:
  - URL input
  - Name field
  - Folder selection
- **Media detail page**:
  - All metadata
  - Image preview (for image types)
  - Delete button with confirmation

### 4.3 Xibo API Integration

- Media API calls:
  - `GET /api/library` → list media (params: folderId, type)
  - `POST /api/library` → upload media (multipart: files, name, folderId)
  - `GET /api/library/download/:id` → download/preview media
  - `DELETE /api/library/{id}` → delete media
  - `GET /api/folders` → list folder structure
- File size formatting utility (bytes → KB/MB/GB)
- Media type icons/labels (image, video, font, module, etc.)

### 4.4 Folder Display

- Build folder tree from flat API response (parentId → children)
- Breadcrumb navigation within folders
- Folder filtering on media list

### 4.5 Tests

- Route tests:
  - List media (empty, with data, filtered by folder/type)
  - Upload file (success, validation errors, API errors)
  - Upload from URL (success, download failure, upload failure)
  - Delete media (confirmation, success)
  - View media details
- Folder tree building tests
- File size formatting tests

### Expected Outcome

Can browse media in folders, upload files (from disk or URL), view media details with preview, and delete media. All operations go through the Xibo API.

---

## Chunk 5: Layout Builder & Dataset Operations

**Goal**: Auto-generate menu board layouts with product grids and browse datasets.

### 5.1 Layout Routes (`src/routes/admin/layouts.ts`)

- `GET /admin/layouts` - List all layouts with status
  - Display: name, description, status (draft/published/etc.), dimensions, modified date
  - Actions: view, delete
- `GET /admin/layout/create` - Layout creation form
  - Select a category to generate layout for
  - Shows preview of grid positioning
- `POST /admin/layout/create` - Create layout from category
  - Auto-generate 1080x1920 portrait layout with:
    - Header region (950x250, centered at top) showing category name
    - 3x4 product grid (12 slots) filling the remaining space
    - Each product box: ~166px wide with 83px margins
    - Products populated from selected category
  - Calls Xibo API to create layout, regions, and widgets
  - Publishes layout after creation
- `GET /admin/layout/:id` - View layout details
  - Show layout info, regions, widgets
  - Visual grid representation (HTML/CSS mock of the layout)
- `POST /admin/layout/:id/delete` - Delete single layout
- `POST /admin/layouts/delete-all` - Batch delete all non-system layouts

### 5.2 Layout Builder (`src/lib/xibo/layout-builder.ts`)

Port the Ruby `LayoutBuilder` to TypeScript:

```
Constants:
  SCREEN_WIDTH = 1080
  SCREEN_HEIGHT = 1920
  HEADER_WIDTH = 950
  HEADER_HEIGHT = 250
  GRID_COLS = 3
  GRID_ROWS = 4
  GRID_TOTAL_SLOTS = 12
```

- `createMenuLayout(categoryName, menuBoardId, products)`:
  1. Get or create 1080x1920 resolution
  2. Create layout with name derived from category
  3. Create header region (centered, top)
  4. Create product grid regions (3x4, calculated positions)
  5. Add text widgets to header and product regions
  6. Publish layout
  7. Return layout details
- `calculateGridPositions(cols, rows, screenWidth, screenHeight, headerHeight)`:
  - Calculate box width, height, margins
  - Return array of `{ top, left, width, height }` for each slot
- `getOrCreateResolution(width, height)`:
  - Check existing resolutions
  - Create if not found

### 5.3 Layout Templates (`src/templates/admin/layouts.tsx`)

- **Layout list page**: Table with status badges (draft=yellow, published=green)
- **Layout creation form**: Category dropdown, preview grid
- **Layout detail page**: Layout info + visual grid representation
  - CSS grid showing the 3x4 layout with product names in boxes
  - Header region at top
  - Exact positioning shown
- **Grid visualization component**: Reusable for both creation preview and detail view

### 5.4 Resolution Management

- `GET /api/resolution` → list available resolutions
- Create 1080x1920 (portrait) resolution if it doesn't exist
- Support for other resolutions in the future

### 5.5 Dataset Routes (`src/routes/admin/datasets.ts`)

- `GET /admin/datasets` - List all datasets
  - Display: name, description, code, column count, row count, modified date
  - Link to Xibo CMS for full dataset editing (not replicated here)
- `GET /admin/dataset/:id` - View dataset details
  - Show columns with types
  - Show row count
  - Show sample data (first 10 rows)

### 5.6 Dataset Templates (`src/templates/admin/datasets.tsx`)

- **Dataset list page**: Table with dataset info
- **Dataset detail page**: Column definitions + sample data table

### 5.7 Xibo API Integration

- Layout API calls:
  - `GET /api/layout` → list layouts
  - `POST /api/layout` → create layout (name, description, resolutionId)
  - `DELETE /api/layout/{id}` → delete layout
  - `POST /api/region/{layoutId}` → create region (width, height, top, left)
  - `POST /api/playlist/widget/{type}/{playlistId}` → create widget
  - `PUT /api/layout/publish/{id}` → publish layout
- Resolution API calls:
  - `GET /api/resolution` → list resolutions
  - `POST /api/resolution` → create resolution
- Dataset API calls:
  - `GET /api/dataset` → list datasets
  - `GET /api/dataset/{id}` → get dataset details
  - `GET /api/dataset/data/{id}` → get dataset rows

### 5.8 Tests

- Layout builder unit tests:
  - Grid position calculations (exact pixel values)
  - Resolution creation
  - Full layout creation flow (mock API)
- Layout route tests:
  - List layouts, create layout, delete layout
  - Batch delete
- Dataset route tests:
  - List datasets, view dataset details
- Grid visualization rendering tests

### Expected Outcome

Can auto-generate portrait menu board layouts from categories, view layout details with grid visualization, delete layouts, and browse datasets. Layout builder produces identical 1080x1920 grids to the Ruby version.

---

## Chunk 6: Polish, CI/CD & Deployment

**Goal**: Production-ready application with full test coverage, CI/CD pipeline, and Bunny Edge deployment.

### 6.1 Test Coverage to 100%

- Audit all modules for missing tests
- Write integration tests for full request flows:
  - Setup → login → configure API → create board → add category → add products → generate layout
  - Media upload → view → delete
  - User invite → accept → login as manager
  - Session management (view, kill, kill all)
- Edge cases:
  - Xibo API timeouts and network errors
  - Token expiry during multi-step operations
  - Concurrent request handling
  - Large media uploads
  - Invalid API credentials
  - Empty states (no boards, no media, etc.)
- Run `deno task test:coverage` and fill all gaps

### 6.2 Code Quality

- Run `deno task precommit` (typecheck + lint + cpd + test:coverage)
- Fix all Biome lint errors
- Fix all jscpd duplication warnings (use FP patterns)
- Review cognitive complexity (max 7 in source, max 30 in tests)
- Verify no `any` types, no `var`, no `forEach`, no `console.log`

### 6.3 Dashboard Polish

- Update dashboard to show comprehensive overview:
  - Xibo API connection status with CMS version
  - Menu board count with link to list
  - Media library stats (count by type)
  - Layout count with status breakdown
  - Dataset count
  - Recent activity log (last 20 operations)
  - System info (edge script version, DB status)

### 6.4 Error Handling

- Consistent error pages for:
  - Xibo API connection failures (settings page link)
  - Xibo API errors (show error details, retry link)
  - 404 not found
  - 403 forbidden (CSRF, auth)
  - 500 server errors
- Flash messages for success/error after form submissions
- Error boundaries in route handlers

### 6.5 CI/CD Pipeline (`.github/workflows/`)

- **test.yml**: Run on PR and push to main
  - Install Deno
  - Run `deno task precommit` (typecheck + lint + cpd + test:coverage)
  - Upload coverage report as artifact
- **deploy.yml**: Deploy to Bunny Edge (on push to main/release)
  - Run `deno task build:edge`
  - Upload bundled script to Bunny Edge Scripting
  - Verify deployment

### 6.6 User & Session Management

- Verify user invite flow works (reused from tickets):
  - Owner generates invite link
  - Manager accepts invite, sets password
  - Manager can login and manage Xibo
- Verify session management works:
  - View active sessions
  - Kill individual sessions
  - Kill all other sessions
- Password change flow with DATA_KEY re-wrapping

### 6.7 Documentation

- Update `README.md`:
  - Project description
  - Architecture overview
  - Setup instructions (Bunny Edge Scripting + Turso)
  - Environment variables
  - Development workflow
  - Deployment instructions
- Update `CLAUDE.md` with final module list and patterns
- Remove old Ruby documentation files:
  - `ARCHITECTURE.md` (replace or merge into README)
  - `MCP_SETUP.md` (remove - no longer relevant)

### 6.8 Performance

- Run `scripts/profile-cold-boot.ts` to measure edge script cold start
- Optimize lazy loading (ensure routes load on demand)
- Verify CSS is minified and cache-busted
- Verify API response caching reduces Xibo API calls
- Test with Bunny Edge Scripting's execution limits

### 6.9 Final Cleanup

- Remove all Ruby artifacts (verify nothing remains)
- Remove unused npm dependencies
- Verify `deno.lock` is committed and up to date
- Final pass through all files for consistency
- Verify biome and deno lint pass with zero warnings

### Expected Outcome

Production-ready Bunny Edge Script deployed to Bunny CDN. 100% test coverage. CI/CD pipeline running. Full menu board management, media library, layout builder, and dataset browser through a clean web UI. Multi-user admin with invite flow and session management.

---

## Dependency Graph

```
Chunk 1 (Infrastructure)
    ↓
Chunk 2 (Xibo API Client)
    ↓
Chunk 3 (Menu Boards) ←→ Chunk 4 (Media Library)
    ↓                         ↓
Chunk 5 (Layouts & Datasets)
    ↓
Chunk 6 (Polish & Deploy)
```

Chunks 3 and 4 can be worked on in parallel since they're independent feature areas that both depend on Chunk 2's API client. Chunk 5 depends on both (layouts reference menu boards, and media is used in products/layouts).

---

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
