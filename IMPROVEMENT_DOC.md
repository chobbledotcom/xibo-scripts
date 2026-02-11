# Improvement Plan: Multi-Tenant Menu Display Management

Transform the current admin-only Xibo management tool into a multi-tenant platform where ice cream van, restaurant, and takeaway owners ("users") manage their own menu displays via screens powered by Xibo CMS.

---

## 1) Vision, Scope, and Success Criteria

### Vision
Enable non-technical business operators to maintain accurate, attractive menu displays with minimal admin intervention while preserving strict tenant isolation.

### In Scope
- Multi-role authentication and authorization (Owner, Manager, User).
- Business and screen provisioning with Xibo mappings.
- Media management with shared and per-business libraries.
- Product CRUD and menu composition workflows.
- Schedule publishing to physical displays.
- Auditability, operational guardrails, and rollback-safe publishing.
- Edge-runtime compatible execution: all operations complete within request/response lifecycle.

### Out of Scope (for this implementation)
- Payment processing, subscriptions, and billing.
- White-label theming per tenant.
- Multi-language content translation workflows.
- Full offline mode for device control.

### Success Metrics (measurable)
- Time-to-first-screen for a new business: **< 20 minutes**.
- Product-to-live latency after publish: **< 2 minutes** (normal conditions).
- Cross-tenant data leakage incidents: **0**.
- Failed publish operations requiring manual DB intervention: **< 1%**.
- User-reported "cannot find where to edit" support tickets trend downward after launch.

---

## 2) Role Hierarchy

| Role | Can Create | Can See | Key Privileges |
|------|-----------|---------|----------------|
| **Owner** | Managers, Users | Everything | Settings, sessions, full user management |
| **Manager** | Users only | Everything except settings/sessions | Business/screen management, shared photos, impersonation |
| **User** | Nothing | Own businesses only | Product management, menu screen editing |

### Permission Rules (explicit)
- **Default deny**: if a route/action is not explicitly allowed, deny access.
- **Manager scope**: managers can only manage users/businesses they are assigned to.
- **Impersonation**: must be logged (actor, target, reason, timestamp) and visibly indicated in UI.
- **Destructive actions** (delete business/screen/media) require confirmation + impact summary.

---

## 3) Key Entities

```text
Owner/Manager
  └─ Business (name, Xibo folder, Xibo dataset)
       ├─ Screen (name, Xibo display)
       │    └─ Menu Screens (ordered, timed, each is a Xibo layout)
       │         └─ Menu Items (name, image, price, order)
       ├─ Users (assigned to business)
       └─ Media Folder (per-business in Xibo, "{name}-{suffix}")

Shared Photo Repository (single Xibo folder, managed by owners/managers)
```

### Additional System Entities to Include
- **AuditEvent**: immutable log for critical actions (auth, impersonation, publish, delete).
- **PublishAttempt**: tracks request-scoped publish attempts/status (`started`, `success`, `failed`) with duration and error details.
- **TemplateVersion**: links layouts to template revision for traceability.
- **BusinessMembership**: many-to-many mapping of users to businesses with role-in-business.

---

## 4) Xibo Data Strategy

Everything Xibo needs to render displays lives in Xibo. Our database stores configuration, mappings, and access control.

- **Product images** → Xibo media library (shared folder + per-business folders)
- **Product data** → Xibo datasets (one per business; fixed columns below)
- **Menu screens** → Xibo layouts (generated from templates with product data)
- **Screen scheduling** → Xibo campaigns/schedules (layout rotation per display)
- **Business/screen/user mappings** → Our libsql database

### Dataset Schema (per business)
Required columns:
- `product_id` (string/uuid, stable key)
- `name` (string)
- `price` (decimal string)
- `media_id` (string/int)
- `available` (boolean)
- `sort_order` (int)
- `category` (string; plain text label on product used for filtering/grouping only, no separate category entity)
- `updated_at` (ISO datetime)

Allowed optional columns:
- `description`
- `allergens`
- `tags`

### Mapping Rules
- Never use mutable display names as primary linkage keys.
- Store both our internal IDs and Xibo IDs on mapping rows.
- Treat Xibo as external system of record for rendered assets; local DB is control-plane state.

---

## 5) End-to-End Workflows (Happy Paths)

### A) Onboard New Business
1. Owner/Manager creates Business.
2. System provisions Xibo folder + dataset.
3. Manager assigns users to business.
4. Manager links existing Xibo displays to Screens.
5. User adds products and images.
6. User builds menu screens and publishes schedule.

### B) Publish Menu Update
1. User edits products/menu.
2. User clicks Publish.
3. System creates `PublishAttempt`, validates prerequisites, generates/updates layouts within the same request.
4. System updates campaign/schedule.
5. UI shows result + changed screens + rollback option.

### C) Emergency Rollback
1. User/Manager selects previous publish snapshot.
2. System reapplies prior layout/schedule mapping.
3. `AuditEvent` records actor/reason/snapshot.

---

## 6) Phases

| Phase | Depends On | Delivers | Parallelizable |
|-------|-----------|----------|----------------|
| [**1: Auth & Data Model**](IMPROVEMENT_PART1.md) | — | Roles, DB schema, guards, navigation | No (foundation) |
| [**2: Business & Screen Admin**](IMPROVEMENT_PART2.md) | Phase 1 | Business/screen CRUD, Xibo provisioning, impersonation | Yes (with Phase 3) |
| [**3: Media Management**](IMPROVEMENT_PART3.md) | Phase 1 | Shared photos, per-business media, isolation | Yes (with Phase 2) |
| [**4: User Dashboard & Products**](IMPROVEMENT_PART4.md) | Phases 2 + 3 | User dashboard, product CRUD via Xibo datasets | No |
| [**5: Menu Screens & Scheduling**](IMPROVEMENT_PART5.md) | Phase 4 | Menu builder, Xibo layout generation, display scheduling | No |
| **6: Hardening & Observability** | Phases 1-5 | Audit logs, alerting, retries, rate limits, runbooks | Partial |

### Definition of Done per Phase (minimum)
- Feature flags added for risky changes.
- Access control tests for all new protected routes/actions.
- Error states implemented in UI (not just success flows).
- Audit logging for create/update/delete and impersonation where applicable.
- Request-time budgets defined and enforced for all Xibo API calls used in that phase.

---

## 7) Route Structure

After all phases, the route structure will be:

```text
/admin/*          → Owner/manager administration
  /admin/businesses
  /admin/business/:id
  /admin/business/:id/screens
  /admin/media/shared
  /admin/users
  /admin/settings      (owner only)
  /admin/sessions      (owner only)

/dashboard/*      → User-facing pages
  /dashboard
  /dashboard/business/:id
  /dashboard/business/:id/products
  /dashboard/business/:id/product/create
  /dashboard/media
  /dashboard/media/upload
  /dashboard/business/:bizId/screen/:screenId/menus
  /dashboard/business/:bizId/screen/:screenId/menu/create
```

### Routing Safeguards
- Enforce business context on every dashboard route (`bizId` must be authorized).
- Prevent IDOR by server-side checks even if client hides links.
- Redirect users with multiple businesses to an explicit business selector when context missing.

---

## 8) Security, Privacy, and Compliance Baseline

- **Auth/session security**: secure cookie flags, CSRF protection for mutating actions.
- **Least privilege**: role checks at API/action layer, not only UI.
- **Tenant isolation**: every business-scoped query includes tenant filter; add guard helper to avoid omissions.
- **Input/media validation**: file type/size checks, filename sanitization, max upload size.
- **Secrets handling**: no Xibo API credentials in client logs or browser-visible payloads.
- **Retention**: define policy for audit logs and deleted media references.

---

## 9) Reliability and Operational Controls

- Idempotent provisioning for Xibo folder/dataset creation.
- Retry with backoff for transient Xibo API failures.
- Circuit-breaker behavior for upstream outage to avoid cascading failures.
- No background workers: publish/provision flows are request-scoped and must finish within edge runtime limits.
- Replace queues with persisted `PublishAttempt`/provision logs for manual replay by reissuing requests.
- Health dashboard: publish success rate, request duration percentiles, and API error rates.
- Hard request timeout strategy: return actionable partial-failure state and never leave local mappings ambiguous.

---

## 10) Testing Strategy (minimum matrix)

- **Unit tests**: permission guard logic, mapping functions, payload validators.
- **Integration tests**: business/user assignments, publish flow, rollback flow.
- **Contract tests**: Xibo API adapter request/response mapping.
- **E2E tests**: owner onboarding a business; user publishing a menu.
- **Security tests**: unauthorized tenant access attempts blocked.
- **Regression suite**: screen assignment and schedule updates.
- **Runtime-limit tests**: publish/provision paths complete within configured edge execution budget.

CI gates:
- Lint + typecheck
- Unit/integration tests
- Migration checks
- Smoke E2E for core path

---

## 11) Migration & Rollout Plan

1. Ship behind feature flags per phase.
2. Migrate schema in additive steps (expand → backfill → switch reads/writes → cleanup).
3. Pilot with 1-2 internal businesses.
4. Enable for selected managers.
5. Full rollout after error-rate and support-ticket thresholds are stable.

Rollback readiness:
- Keep old route handlers available until cutover confidence is met.
- Version template/layout generation logic.
- Document manual recovery steps for failed provisioning.

---

## 12) Implementation Decisions (Locked)

1. **Data model choice**: product storage is Xibo datasets (not Menu Board module).
2. **Template strategy**: start with internal placeholder templates and version them; external design assets can replace versions later without changing workflow.
3. **Multi-business behavior**: users with multiple businesses must select active business context before media/product/menu actions.
4. **Display assignment**: displays must already exist in Xibo before assignment in this system.
5. **Publish model**: immediate publish only in this phase set.
6. **Edit conflict model**: last-write-wins with audit trail for who published last.
7. **Image lifecycle**: soft-delete media references on product delete; run explicit admin cleanup action for orphan media.
8. **Category model**: `category` is a simple product string attribute; there is no separate categories ownership system.
9. **Execution model**: no long-running/background jobs; operations must complete during request handling.

---

## 13) Quick Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Cross-tenant access bug | Medium | Critical | Centralized authorization helpers + tests on every scoped endpoint |
| Xibo API instability | Medium | High | Retries, strict timeouts, observable failure states, replay tools |
| Broken templates cause blank displays | Medium | High | Template versioning + preview + rollback snapshot |
| Operational complexity for managers | Medium | Medium | Guided wizards, sane defaults, checklist-driven onboarding |
| Data drift between local mappings and Xibo | Low-Med | High | Reconciliation command + admin "resync" action |

---

## 14) Implementation Checklist (Practical)

- [ ] Define canonical DB schema with mapping/audit/publish tables.
- [ ] Add centralized `authorize(actor, action, resource)` helper.
- [ ] Implement business context resolver middleware.
- [ ] Build Xibo adapter with typed errors + retry policy.
- [ ] Add request-scoped publish pipeline with `PublishAttempt` status endpoint.
- [ ] Add audit log viewer for owners.
- [ ] Add reconciliation command for Xibo/local mapping drift.
- [ ] Add runbooks for top 5 operational failures.
- [ ] Add dashboards/alerts before broad rollout.

This checklist turns the plan into execution-ready work items and reduces blind spots during implementation.
