# Phase 3: Media Management

> Part 3 of 5 — [Overview](IMPROVEMENT_DOC.md) · [Part 1](IMPROVEMENT_PART1.md) · [Part 2](IMPROVEMENT_PART2.md) · **Part 3** · [Part 4](IMPROVEMENT_PART4.md) · [Part 5](IMPROVEMENT_PART5.md)

**Goal**: Create the shared photo repository for admins/managers and per-business media browsing for users. Enforce media isolation.

**Depends on**: Phase 1

**Parallel track**: Can be developed in parallel with Phase 2.

---

## 3.1 Shared Photo Repository

**Setup**: Create a "Shared" folder in Xibo (one-time, stored in settings as `SHARED_FOLDER_ID`).

**Admin/manager routes** (extend `src/routes/admin/media.ts`):

| Route | Method | Description |
|-------|--------|-------------|
| `/admin/media/shared` | GET | Browse shared photo repository |
| `/admin/media/shared/upload` | GET | Upload form (PNG only) |
| `/admin/media/shared/upload` | POST | Upload to shared Xibo folder |
| `/admin/media/shared/:id/delete` | POST | Delete from shared folder |

**Validation**:
- Only accept PNG files for the shared repository (transparent background enforcement is manual/policy-based)
- Standard naming convention — the uploaded filename is the product name

## 3.2 Per-Business Media (User View)

**User routes** (`src/routes/user/media.ts` — new route module for user-facing pages):

| Route | Method | Description |
|-------|--------|-------------|
| `/dashboard/media` | GET | Browse: shared photos (read-only) + own business photos (editable) |
| `/dashboard/media/upload` | GET | Upload form |
| `/dashboard/media/upload` | POST | Upload to business's Xibo folder |
| `/dashboard/media/:id/delete` | POST | Delete from own business folder only |
| `/dashboard/media/:id/preview` | GET | Image preview proxy |

**Media isolation**:
- Users see two sections: "Shared Photos" (read-only) and "My Photos" (editable)
- Shared photos come from the shared Xibo folder (`folderId` filter)
- Own photos come from the user's business Xibo folder (`folderId` filter)
- Delete only allowed on media in the user's own business folder (verify `folderId` matches before allowing delete)
- Users with multiple businesses see a business switcher

## 3.3 Refactor Existing Media Routes

The current `/admin/media` routes become the admin "power tool" view with full access to the Xibo media library (all folders). The new user-facing routes provide the filtered, simplified experience.

## 3.4 Tests

- Shared folder creation and ID storage
- Upload to shared folder (PNG validation)
- Upload to business folder
- Media isolation: user cannot see other businesses' media
- Media isolation: user cannot delete shared photos
- Media isolation: user cannot delete other businesses' photos
- Admin/manager can see all media
- Business switcher for multi-business users

## Definition of Done

- Shared photo repository functional for admins/managers
- Users can browse shared + own business photos
- Users can upload to their own business folder
- Media isolation enforced at application level
- `deno task precommit` passes with 100% coverage
