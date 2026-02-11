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

**`src/lib/db/migrations/index.ts`** — add new tables:

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
  business_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  PRIMARY KEY (business_id, user_id)
);

-- Screens (belong to a business, map to Xibo displays)
CREATE TABLE screens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,              -- encrypted
  business_id INTEGER NOT NULL,
  xibo_display_id INTEGER,        -- Xibo display ID
  created_at TEXT NOT NULL         -- encrypted ISO 8601
);

-- Menu screens (user-configured, each becomes a Xibo layout)
CREATE TABLE menu_screens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,              -- encrypted (internal use)
  screen_id INTEGER NOT NULL,
  template_id TEXT NOT NULL,       -- layout template identifier
  display_time INTEGER NOT NULL,   -- seconds to show
  sort_order INTEGER NOT NULL,     -- rotation order
  xibo_layout_id INTEGER,         -- resulting Xibo layout ID
  created_at TEXT NOT NULL         -- encrypted ISO 8601
);
```

## 1.3 Auth & Access Control

**`src/routes/utils.ts`**:
- Add `requireManagerOrAbove` guard (allows owner + manager, blocks user)
- Add `requireOwnerOnly` guard (existing `requireOwnerOr`, rename for clarity)
- Update `requireSessionOr` to work with all three roles

**`src/routes/admin/users.ts`**:
- Managers can create users (admin_level = "user") via invite flow
- Managers CANNOT create managers or owners — enforce in the create handler
- Owners can create managers and users

## 1.4 Role-Based Navigation

**`src/templates/admin/nav.tsx`**:
- **Owner**: Dashboard, Businesses, Screens, Media, Users, Settings, Sessions, Logout
- **Manager**: Dashboard, Businesses, Screens, Media, Users, Logout
- **User**: Dashboard (their businesses), My Menu, Logout
- All roles share the same login page

## 1.5 Tests

- Unit tests for new DB operations (businesses, screens, business_users CRUD)
- Auth guard tests for three-tier role enforcement
- Navigation rendering tests per role
- Manager cannot create manager/owner users
- Migration idempotency tests

## Definition of Done

- `AdminLevel` includes `"user"`, all existing tests pass
- New tables created and migrated
- Role-based guards and navigation working
- `deno task precommit` passes with 100% coverage
