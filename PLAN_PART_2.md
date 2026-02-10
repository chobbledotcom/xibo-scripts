# Part 2: Xibo API Client & Connection

**Goal**: A TypeScript Xibo API client that authenticates via OAuth2, makes API calls, and is configurable through the admin settings page.

**Depends on**: Part 1 (base infrastructure, settings DB, admin layout)

### Dev Environment

The following env vars are available in the dev environment for running tests against a real Xibo CMS instance:

- `XIBO_API_URL` - Xibo CMS base URL
- `XIBO_CLIENT_ID` - OAuth2 client ID
- `XIBO_CLIENT_SECRET` - OAuth2 client secret

Use these for integration tests that hit the real API (in addition to unit tests with mocked responses).

---

## 2.1 Xibo API Client (`src/lib/xibo/client.ts`)

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

## 2.2 Response Caching (`src/lib/xibo/cache.ts`)

- In-memory cache with TTL (e.g., 30 seconds for list operations)
- Cache keys based on endpoint + params
- Automatic invalidation on mutations (POST/PUT/DELETE -> invalidate related GET caches)
- `invalidateAll()` for manual cache clear
- Cache strategy:
  - `menuboards` -> cached, invalidated on board mutations
  - `categories_{boardId}` -> cached, invalidated on category mutations
  - `products_{categoryId}` -> cached, invalidated on product mutations
  - `library` -> cached, invalidated on media mutations
  - `layout` -> cached, invalidated on layout mutations
  - `dataset` -> cached, invalidated on dataset mutations

## 2.3 Xibo API Types (`src/lib/xibo/types.ts`)

TypeScript interfaces for all Xibo API entities:

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

## 2.4 Admin Settings Page (`src/routes/admin/settings.ts`)

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

## 2.5 Dashboard Integration

- Update `src/routes/admin/dashboard.ts`:
  - Show Xibo API connection status
  - Show Xibo CMS version (from API response headers)
  - Show count of menu boards, media items, layouts (if connected)
  - Show "Configure Xibo API" prompt if not connected
- Update `src/templates/admin/dashboard.tsx` accordingly

## 2.6 Tests

**Unit tests** (mock HTTP responses):
- Xibo client:
  - Authentication flow (success, failure, token refresh)
  - GET/POST/PUT/DELETE operations
  - Error handling (network errors, 4xx, 5xx)
  - Multipart upload
- Cache:
  - Cache hit/miss, TTL expiry, invalidation
- Settings:
  - Save/load encrypted credentials
  - Connection test
  - Settings page rendering

**Integration tests** (real Xibo API via env vars):
- Authenticate with real credentials from `XIBO_API_URL`/`XIBO_CLIENT_ID`/`XIBO_CLIENT_SECRET`
- List menu boards, media, layouts from real CMS
- Verify response shapes match TypeScript interfaces

## Expected Outcome

Admin can configure Xibo API credentials in settings. Dashboard shows connection status. API client authenticates and is ready for use by subsequent chunks.
