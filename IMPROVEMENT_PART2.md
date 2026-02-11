# Phase 2: Business & Screen Administration

> Part 2 of 5 — [Overview](IMPROVEMENT_DOC.md) · [Part 1](IMPROVEMENT_PART1.md) · **Part 2** · [Part 3](IMPROVEMENT_PART3.md) · [Part 4](IMPROVEMENT_PART4.md) · [Part 5](IMPROVEMENT_PART5.md)

**Goal**: Build admin/manager UI for managing businesses, screens, user assignments, and impersonation. Connect businesses to Xibo folders and datasets.

**Depends on**: Phase 1

**Parallel track**: Can be developed in parallel with Phase 3.

---

## 2.1 Business Management

**New routes** (`src/routes/admin/businesses.ts`):

| Route | Method | Description |
|-------|--------|-------------|
| `/admin/businesses` | GET | List all businesses |
| `/admin/business/create` | GET | Create form |
| `/admin/business/create` | POST | Create business + Xibo folder + Xibo dataset |
| `/admin/business/:id` | GET | Business detail (screens, users) |
| `/admin/business/:id` | POST | Update business name |
| `/admin/business/:id/delete` | POST | Delete business (and Xibo folder/dataset) |
| `/admin/business/:id/assign-user` | POST | Assign user to business |
| `/admin/business/:id/remove-user` | POST | Remove user from business |

**New DB operations** (`src/lib/db/businesses.ts`):
- `createBusiness(name)` — insert into businesses table
- `getBusinessById(id)` — single business with decrypt
- `getAllBusinesses()` — list all
- `getBusinessesForUser(userId)` — businesses a user belongs to
- `assignUser(businessId, userId)` / `removeUser(businessId, userId)`
- `updateBusiness(id, name)` / `deleteBusiness(id)`

**Xibo integration on business creation**:
1. Generate folder name: `"{businessName}-{random6chars}"`
2. Create Xibo folder via `POST /folder` → store `xibo_folder_id`
3. Create Xibo dataset via `POST /dataset` with columns:
   - `name` (String) — product name
   - `price` (String) — display price e.g. "3.50"
   - `media_id` (Number) — Xibo media ID for product image
   - `available` (Number) — 1 = yes, 0 = no
   - `sort_order` (Number) — display ordering
4. Store `xibo_dataset_id` on the business record

## 2.2 Screen Management

**New routes** (`src/routes/admin/screens.ts`):

| Route | Method | Description |
|-------|--------|-------------|
| `/admin/business/:id/screens` | GET | List screens for business |
| `/admin/business/:id/screen/create` | GET | Create screen form (with Xibo display picker) |
| `/admin/business/:id/screen/create` | POST | Create screen + assign Xibo display |
| `/admin/business/:businessId/screen/:id` | GET | Screen detail (assigned menu screens) |
| `/admin/business/:businessId/screen/:id/delete` | POST | Delete screen |

**Xibo display integration**:
- Fetch available displays via `GET /display` from Xibo API
- Show unassigned displays in the creation form
- Store the `xibo_display_id` mapping in our screens table

## 2.3 Impersonation

**Mechanism**:
1. Admin clicks "Impersonate" on a user in the user management page
2. System stores the admin's current session token in a `__Host-admin-session` cookie
3. System creates a new session with `user_id` = impersonated user, using the admin's `wrapped_data_key`
4. Sets `__Host-session` cookie to the new session
5. The admin now experiences the system as that user

**UI indicators**:
- When `__Host-admin-session` cookie exists, show a red banner at the top of every page: "You are impersonating {username} — Stop Impersonating"
- The "Stop Impersonating" link deletes the impersonation session, restores the admin session cookie, and redirects to the user management page
- The Logout link in nav changes to "Stop Impersonating" during impersonation

**Routes**:

| Route | Method | Description |
|-------|--------|-------------|
| `/admin/users/:id/impersonate` | POST | Start impersonation |
| `/admin/stop-impersonating` | GET | End impersonation, restore admin session |

## 2.4 Tests

- Business CRUD (create, read, update, delete)
- Business-user assignment and removal
- Screen CRUD within a business
- Xibo folder/dataset creation on business creation (mock Xibo API)
- Xibo display listing and assignment (mock Xibo API)
- Impersonation session switching
- Impersonation banner rendering
- Stop-impersonating flow
- Access control: users cannot access business admin routes

## Definition of Done

- Owners/managers can create businesses with auto-provisioned Xibo folder + dataset
- Screens can be created and linked to Xibo displays
- Users can be assigned to businesses
- Impersonation works end-to-end with visual indicator
- `deno task precommit` passes with 100% coverage
