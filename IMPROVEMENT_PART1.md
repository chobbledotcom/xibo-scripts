# Phase 1: Auth, Roles & Data Model

> Part 1 of 5 — [Overview](IMPROVEMENT_DOC.md) · **Part 1** · [Part 2](IMPROVEMENT_PART2.md) · [Part 3](IMPROVEMENT_PART3.md) · [Part 4](IMPROVEMENT_PART4.md) · [Part 5](IMPROVEMENT_PART5.md)

**Goal**: Extend the role system to support three tiers (owner > manager > user) and create the database schema for businesses, screens, and user assignments.

**Depends on**: Nothing (foundation phase)

---

## 1.1 Type Changes

**`src/lib/types.ts`**:
- Extend `AdminLevel` to `"owner" | "manager" | "user"`
- Add `AdminSession.impersonating?: { username: string; userId: number }` for impersonation banner

## 1.2 Database Migrations

**`src/lib/db/migrations/index.ts`** — add new tables with FK constraints and indexes:

```sql
-- Businesses
CREATE TABLE businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,              -- encrypted
  xibo_folder_id INTEGER,         -- Xibo folder ID for business media
  folder_name TEXT,               -- encrypted "{name}-{randomsuffix}"
  xibo_dataset_id INTEGER,        -- Xibo dataset ID for products
  created_at TEXT NOT NULL         -- encrypted ISO 8601
);

-- Business-User mapping (many-to-many)
CREATE TABLE business_users (
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (business_id, user_id)
);
CREATE INDEX idx_business_users_user ON business_users(user_id);

-- Screens (belong to a business, map to Xibo displays)
CREATE TABLE screens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,              -- encrypted
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  xibo_display_id INTEGER,        -- Xibo display ID
  created_at TEXT NOT NULL         -- encrypted ISO 8601
);
CREATE INDEX idx_screens_business ON screens(business_id);

-- Menu screens (user-configured, each becomes a Xibo layout)
CREATE TABLE menu_screens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,              -- encrypted (internal use)
  screen_id INTEGER NOT NULL REFERENCES screens(id),
  template_id TEXT NOT NULL,       -- layout template identifier
  display_time INTEGER NOT NULL,   -- seconds to show
  sort_order INTEGER NOT NULL,     -- rotation order
  xibo_layout_id INTEGER,         -- resulting Xibo layout ID
  created_at TEXT NOT NULL         -- encrypted ISO 8601
);
CREATE INDEX idx_menu_screens_screen ON menu_screens(screen_id);
```

## 1.3 Auth & Access Control

**`src/routes/utils.ts`**:
- Add `requireManagerOrAbove` guard (allows owner + manager, blocks user)
- Rename `requireOwnerOr` → `requireOwnerOnly` for clarity
- Add `withManagerAuthForm` — form handler for manager-or-above + CSRF
- Generic `requireRole` + `sessionWithRole` factory for zero-duplication guard creation

**`src/routes/admin/users.ts`**:
- Users page accessible by managers (not just owners)
- Managers can create users (admin_level = "user") via invite flow
- Managers CANNOT create managers or owners — enforced server-side
- Owners can create managers and users
- Manager users list is scoped: managers see only user-role users; owners see all

**`src/templates/fields.ts`**:
- `inviteUserFields` is now a function taking actor role — managers see only "User" option, owners see all options

## 1.4 Role-Based Navigation

**`src/templates/admin/nav.tsx`**:

Phase 1 applies role-based visibility to existing functional links. Businesses/Screens links will be added in Phase 2 when their routes are created.

- **Owner**: Dashboard, Menu Boards, Media, Layouts, Datasets, Users, Settings, Sessions, Logout
- **Manager**: Dashboard, Menu Boards, Media, Layouts, Datasets, Users, Logout
- **User**: Dashboard, Logout
- All roles share the same login page

## 1.5 Audit Logging

**`src/routes/admin/users.ts`** — audit entries via `logActivity()`:
- User invitation: `Invited user "{username}" with role "{role}"`
- User activation: `Activated user {userId}`
- User deletion: `Deleted user {userId}`

## 1.6 Feature Flags & Request-Time Budgets

Phase 1 is purely additive — new tables, extended types, new auth guards. No existing behavior is modified in a risky way, so feature flags are not applicable. Request-time budgets are N/A as Phase 1 makes no Xibo API calls. Both will be applied starting in Phase 2 when Xibo provisioning is introduced.

## 1.7 Tests

- Multi-tenant table schema tests (insert, query, PK constraints, auto-increment)
- Auth guard tests: `requireOwnerOnly`, `requireManagerOrAbove`, `withManagerAuthForm`
- Navigation rendering tests for all three roles
- Manager role hierarchy: can create "user", blocked from "manager"/"owner"
- Manager users list scoping (only sees user-role users)
- Migration idempotency tests
- Role-aware form field generation
- Audit log verification for invite, activate, and delete actions

## Definition of Done

- `AdminLevel` includes `"user"`, all existing tests pass
- New tables created with FK constraints and indexes
- Role-based guards and navigation working
- Manager UX: form only shows creatable roles, list only shows manageable users
- Audit logging for user create/activate/delete actions
- `deno task precommit` passes with 100% coverage
