# Missing Tests

Black-box HTTP tests needed to reach 100% line coverage. Each test makes real
HTTP requests through `handleRequest()` so routing, middleware, auth, templates,
and DB code all get exercised together.

All tests use `createTestDbWithSetup()` / `createTestDb()` for DB setup and
`loginAsAdmin()` for authenticated requests. Xibo API calls are intercepted by
mocking `globalThis.fetch`.

---

## 1. Health & Static Assets

**File**: `test/routes/static.test.ts`
Covers: `routes/health.ts` (0%), `routes/assets.ts` (32%), `routes/static.ts` (60%)

```
GET /health
  returns 200 with body "OK"
  returns content-type text/plain

GET /favicon.ico
  returns 200 with content-type image/svg+xml
  returns cache-control immutable header

GET /mvp.css
  returns 200 with content-type text/css
  body is non-empty

GET /admin.js
  returns 200 with content-type application/javascript
  body is non-empty
```

---

## 2. Security Middleware

**File**: `test/routes/middleware.test.ts`
Covers: `routes/middleware.ts` (70%), `routes/index.ts` (66%)

```
domain validation
  rejects request with no Host header → 403
  rejects request with wrong Host → 403
  accepts request with correct Host

content-type validation
  rejects POST with no Content-Type → 400 "Bad Request: Invalid Content-Type"
  rejects POST with application/json → 400
  accepts POST with application/x-www-form-urlencoded
  accepts POST with multipart/form-data
  allows GET requests without Content-Type

security headers
  every response includes x-content-type-options: nosniff
  every response includes x-frame-options: DENY
  every response includes content-security-policy
  every response includes referrer-policy
  every response includes x-robots-tag

hostname extraction
  strips port from Host header (e.g. "localhost:3000" → "localhost")
```

---

## 3. Routing & Not Found

**File**: `test/routes/routing.test.ts`
Covers: `routes/index.ts` (66%), `routes/router.ts` (99%), `routes/utils.ts` (62%)

```
root redirect
  GET / redirects to /admin when setup complete

not found
  GET /nonexistent returns 404
  GET /admin/nonexistent returns 404

trailing slash normalization
  GET /admin/ treated same as GET /admin

setup redirect
  GET / redirects to /setup when setup NOT complete
  GET /admin redirects to /setup when setup NOT complete

request logging
  responses are logged with method, path, status, duration
```

---

## 4. Setup Flow

**File**: `test/routes/setup.test.ts`
Covers: `routes/setup.ts` (via index.ts), `routes/utils.ts` (csrfCookie, requireCsrfForm, htmlResponseWithCookie)

```
GET /setup
  returns 200 with setup form HTML when setup not complete
  sets setup_csrf cookie
  redirects to / when setup already complete

POST /setup — CSRF
  rejects when csrf_token missing from form → 403
  rejects when setup_csrf cookie missing → 403
  rejects when cookie and form token don't match → 403
  returns fresh CSRF token on rejection

POST /setup — validation
  rejects missing admin_username → 400
  rejects missing admin_password → 400
  rejects password shorter than 8 chars → 400
  rejects mismatched passwords → 400

POST /setup — success
  creates admin user and redirects to /setup/complete
  accepts optional xibo credentials (url, client_id, client_secret)
  works without xibo credentials

GET /setup/complete
  returns 200 with completion page when setup done
  redirects to /setup when setup not yet complete

POST /setup after already complete
  redirects to /
```

---

## 5. Login & Authentication

**File**: `test/routes/admin/auth.test.ts`
Covers: `routes/admin/auth.ts` (59%), `routes/admin/dashboard.ts` (52%), `templates/admin/login.tsx` (36%), `routes/utils.ts` (withSession, getAuthenticatedSession, parseCookies, getClientIp)

```
GET /admin (unauthenticated)
  returns 200 with login form HTML
  login form has username and password fields
  login form posts to /admin/login

POST /admin/login — validation
  rejects empty username → 400
  rejects empty password → 400

POST /admin/login — invalid credentials
  returns 401 for wrong username
  returns 401 for wrong password
  records failed login attempt

POST /admin/login — success
  returns 302 redirect to /admin
  sets __Host-session cookie with HttpOnly; Secure; SameSite=Strict
  cookie Max-Age is 86400 (24h)

POST /admin/login — rate limiting
  allows 4 failed attempts
  returns 429 on 5th failed attempt from same IP
  clears attempt counter after successful login
  lockout expires (test with mocked nowMs)

GET /admin/login
  redirects to /admin (convenience redirect)

GET /admin/logout
  redirects to /admin
  clears the __Host-session cookie
  invalidates the session in DB

GET /admin/logout (unauthenticated)
  redirects to /admin without error
```

---

## 6. Dashboard

**File**: `test/routes/admin/dashboard.test.ts`
Covers: `routes/admin/dashboard.ts` (52%), `templates/admin/dashboard.tsx` (3%), `templates/layout.tsx` (72%)

```
GET /admin (authenticated, no Xibo configured)
  returns 200 with dashboard HTML
  shows "Not connected" status
  shows link to /admin/settings
  includes navigation bar
  includes Quick Links section

GET /admin (authenticated, Xibo configured + connected)
  shows "Connected" with CMS version
  shows resource counts (menu boards, media, layouts, datasets)

GET /admin (authenticated, Xibo configured but unreachable)
  shows "Not connected" status
  still returns 200

session expiry
  returns login page when session token is expired
  deletes expired session from DB

session with deleted user
  returns login page when session's user no longer exists
  deletes orphaned session
```

---

## 7. Settings

**File**: `test/routes/admin/settings.test.ts`
Covers: `routes/admin/settings.tsx` (16%), `lib/db/settings.ts` (76%), `templates/fields.ts` (95%)

```
GET /admin/settings (unauthenticated)
  redirects to /admin

GET /admin/settings (non-owner role)
  returns 403

GET /admin/settings (owner)
  returns 200 with settings page
  shows "Not configured" when no Xibo credentials
  shows current Xibo URL when configured
  shows Xibo credentials form
  shows change password form
  shows success message from query parameter

POST /admin/settings/xibo — update credentials
  rejects without CSRF token → 403
  rejects unauthenticated → redirect
  rejects non-owner → 403
  validates required fields (url, client_id, client_secret) → 400
  saves encrypted credentials and redirects with success message
  credentials are readable after save (round-trip)

POST /admin/settings/test — connection test
  rejects unauthenticated → redirect
  rejects non-owner → 403
  shows "not configured" when no Xibo credentials saved
  shows success result with version when Xibo reachable
  shows failure message when Xibo unreachable

POST /admin/settings/password — change password
  rejects unauthenticated → redirect
  rejects non-owner → 403
  rejects without CSRF → 403
  rejects missing current_password → 400
  rejects missing new_password → 400
  rejects new password shorter than 8 chars → 400
  rejects mismatched new_password and new_password_confirm → 400
  rejects wrong current password → 400
  changes password and redirects with success message
  invalidates all sessions after password change
  can log in with new password after change
```

---

## 8. Sessions Management

**File**: `test/routes/admin/sessions.test.ts`
Covers: `routes/admin/sessions.tsx` (34%), `lib/db/sessions.ts` (51%)

```
GET /admin/sessions (unauthenticated)
  redirects to /admin

GET /admin/sessions (non-owner)
  returns 403

GET /admin/sessions (owner)
  returns 200 with sessions page
  shows active session count
  shows "Clear Other Sessions" button with CSRF token

POST /admin/sessions/clear
  rejects unauthenticated → redirect
  rejects non-owner → 403
  rejects without CSRF → 403
  deletes all sessions except current
  redirects to /admin/sessions
  current session still works after clearing others
```

---

## 9. Login Rate Limiting (DB layer)

**File**: `test/lib/db/login-attempts.test.ts`
Covers: `lib/db/login-attempts.ts` (39%)

```
isLoginRateLimited
  returns false for unknown IP
  returns false after fewer than 5 failures

recordFailedLogin
  creates record on first failure
  increments on subsequent failures
  sets locked_until after 5 failures

clearLoginAttempts
  removes record for IP

lockout expiry
  returns true during lockout window
  returns false after lockout expires (mock nowMs)
  clears record when lockout has expired
```

---

## 10. Database Layer

**File**: `test/lib/db/db.test.ts`
Covers: `lib/db/client.ts` (37%), `lib/db/migrations/index.ts` (78%), `lib/db/activityLog.ts` (47%), `lib/db/sessions.ts` (51%), `lib/db/users.ts` (49%), `lib/db/settings.ts` (76%)

These are covered indirectly through the black-box HTTP tests above, but a few
DB-specific behaviors need direct tests:

```
client.ts
  queryOne returns null when no rows match
  queryBatch executes multiple statements
  inPlaceholders builds correct SQL fragment

migrations
  initDb creates all tables
  initDb is idempotent (running twice is safe)
  skips migration when schema is already current

activity log
  logActivity inserts with ISO timestamp
  getAllActivityLog returns entries in reverse chronological order
  getAllActivityLog respects limit parameter

sessions
  createSession stores and caches session
  getSession returns cached session on second call
  getSession returns null for unknown token
  deleteSession removes from DB and cache
  deleteAllSessions clears all sessions
  deleteOtherSessions keeps only the given token
  getAllSessions returns all sessions most-recent-first
  resetSessionCache clears the cache

users
  createUser stores encrypted user
  getUserByUsername finds user by blind index
  getUserById finds user by ID
  isUsernameTaken returns true for existing username
  verifyUserPassword returns hash on success, null on failure
  decryptAdminLevel returns role string
  decryptUsername returns plaintext username
  deleteUser removes user and their sessions

settings
  getSetting returns null for missing key
  setSetting stores and invalidates cache
  isSetupComplete returns false before setup
  isSetupComplete returns true after completeSetup
  completeSetup creates admin user + keys + settings
  getXiboApiUrl/getXiboClientId/getXiboClientSecret decrypt values
  updateXiboCredentials encrypts and stores
  updateUserPassword rehashes, re-wraps key, deletes sessions
  settings cache expires after 5 seconds
```

---

## 11. Form Rendering & Validation

**File**: `test/lib/forms.test.ts` (extend existing)
Covers: `lib/forms.tsx` (70%)

The existing test covers basic text/number/required validation. Missing:

```
renderField
  renders textarea with value
  renders select with options and selected value
  renders checkbox-group with checked values
  renders field hint text
  renders date input
  renders datetime-local input
  escapes HTML in field values

renderFields
  renders multiple fields with pre-filled values

renderError
  returns empty string when no error
  returns error div when error provided

validateForm
  validates checkbox-group field (joins with commas)
  runs custom validate function on field
  returns error from custom validate function
  parses number fields to integers
  returns null for empty optional number field
```

---

## 12. Xibo Client Edge Cases

**File**: `test/lib/xibo/client.test.ts` (extend existing)
Covers: `lib/xibo/client.ts` (75%)

Missing coverage areas:

```
authenticate
  throws on network error with XiboClientError
  throws on non-200 auth response

token refresh
  refreshes token when expired
  re-authenticates on 401 and retries request

error handling
  throwOnError logs error code and throws XiboClientError
  readErrorText returns empty string on read failure

getDashboardStatus
  returns connected status with counts
  returns disconnected status on error

testConnection
  returns success with version on 200
  returns failure with message on error

loadXiboConfig
  returns null when no credentials configured
  returns config object when credentials exist

postMultipart
  sends FormData with auth header

getRaw
  returns raw Response object
```

---

## 13. Crypto Edge Cases

**File**: `test/lib/crypto.test.ts` (extend existing)
Covers: `lib/crypto.ts` (96%)

Missing ~17 lines, likely:

```
importEncryptionKey
  rejects key shorter than 32 bytes
  rejects key longer than 32 bytes

hashPassword
  uses reduced iterations when TEST_REDUCED_ITERATIONS env set

wrapKey / unwrapKey
  throws on corrupted wrapped key data

encryptWithKey / decryptWithKey
  throws on invalid encrypted format prefix
  throws on missing IV separator
```

---

## 14. Template Rendering

**File**: `test/templates/templates.test.ts`
Covers: `templates/layout.tsx` (72%), `templates/admin/dashboard.tsx` (3%), `templates/admin/login.tsx` (36%), `templates/admin/menuboards.tsx` (98%), `templates/fields.ts` (95%)

Most template lines get covered by the route tests above (since routes render
templates and return HTML). The following are covered implicitly:

```
Layout
  includes DOCTYPE
  includes title with " - Xibo Scripts" suffix
  includes CSS and JS asset paths
  renders children
  applies bodyClass when provided
  renders headExtra when provided

adminLoginPage
  renders login form with username and password fields
  shows error message when provided
  shows no error div when no error

adminDashboardPage — disconnected
  shows "Not connected" with link to settings

adminDashboardPage — connected
  shows "Connected" with CMS version
  shows resource counts table
  shows Quick Links

field definitions
  loginFields has username and password
  setupFields has all required fields
  changePasswordFields has current, new, confirm
  xiboCredentialsFields has url, client_id, client_secret
```

---

## Coverage Strategy

The tests above are ordered by priority. Tests 1-8 are HTTP-level black-box
tests that will cover the bulk of the missing lines because requests flow
through the full stack: middleware → routing → auth → handler → DB → template →
response.

Tests 9-14 fill in remaining gaps where specific DB/crypto/form edge cases
can't easily be triggered through HTTP alone.

Estimated coverage after all tests: 100% line coverage.
