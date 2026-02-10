# Part 6: Polish, CI/CD & Deployment

**Goal**: Production-ready application with full test coverage, CI/CD pipeline, and Bunny Edge deployment.

**Depends on**: Parts 1-5 (all features complete)

---

## 6.1 Test Coverage to 100%

- Audit all modules for missing tests
- Write integration tests for full request flows:
  - Setup -> login -> configure API -> create board -> add category -> add products -> generate layout
  - Media upload -> view -> delete
  - User invite -> accept -> login as manager
  - Session management (view, kill, kill all)
- Edge cases:
  - Xibo API timeouts and network errors
  - Token expiry during multi-step operations
  - Concurrent request handling
  - Large media uploads
  - Invalid API credentials
  - Empty states (no boards, no media, etc.)
- Run `deno task test:coverage` and fill all gaps

## 6.2 Code Quality

- Run `deno task precommit` (typecheck + lint + cpd + test:coverage)
- Fix all Biome lint errors
- Fix all jscpd duplication warnings (use FP patterns)
- Review cognitive complexity (max 7 in source, max 30 in tests)
- Verify no `any` types, no `var`, no `forEach`, no `console.log`

## 6.3 Dashboard Polish

- Update dashboard to show comprehensive overview:
  - Xibo API connection status with CMS version
  - Menu board count with link to list
  - Media library stats (count by type)
  - Layout count with status breakdown
  - Dataset count
  - Recent activity log (last 20 operations)
  - System info (edge script version, DB status)

## 6.4 Error Handling

- Consistent error pages for:
  - Xibo API connection failures (settings page link)
  - Xibo API errors (show error details, retry link)
  - 404 not found
  - 403 forbidden (CSRF, auth)
  - 500 server errors
- Flash messages for success/error after form submissions
- Error boundaries in route handlers

## 6.5 CI/CD Pipeline (`.github/workflows/`)

- **test.yml**: Run on PR and push to main
  - Install Deno
  - Run `deno task precommit` (typecheck + lint + cpd + test:coverage)
  - Upload coverage report as artifact
- **deploy.yml**: Deploy to Bunny Edge (on push to main/release)
  - Run `deno task build:edge`
  - Upload bundled script to Bunny Edge Scripting
  - Verify deployment

## 6.6 User & Session Management

- Verify user invite flow works (reused from tickets):
  - Owner generates invite link
  - Manager accepts invite, sets password
  - Manager can login and manage Xibo
- Verify session management works:
  - View active sessions
  - Kill individual sessions
  - Kill all other sessions
- Password change flow with DATA_KEY re-wrapping

## 6.7 Documentation

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

## 6.8 Performance

- Run `scripts/profile-cold-boot.ts` to measure edge script cold start
- Optimize lazy loading (ensure routes load on demand)
- Verify CSS is minified and cache-busted
- Verify API response caching reduces Xibo API calls
- Test with Bunny Edge Scripting's execution limits

## 6.9 Final Cleanup

- Remove all Ruby artifacts (verify nothing remains)
- Remove unused npm dependencies
- Verify `deno.lock` is committed and up to date
- Final pass through all files for consistency
- Verify biome and deno lint pass with zero warnings

## Expected Outcome

Production-ready Bunny Edge Script deployed to Bunny CDN. 100% test coverage. CI/CD pipeline running. Full menu board management, media library, layout builder, and dataset browser through a clean web UI. Multi-user admin with invite flow and session management.
