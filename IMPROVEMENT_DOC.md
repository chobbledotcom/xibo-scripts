# User Class & Menu Management System

## Overview

Transform the existing admin-only Xibo management tool into a multi-tenant system where **users** (ice cream van / restaurant / takeaway owners) log in to manage their own menu displays on Xibo-powered screens.

### Role Hierarchy

| Role | Can create | Access |
|---------|------------|--------|
| **Owner** | Managers, Users | Everything: settings, Xibo config, all businesses, all users, impersonation, shared media |
| **Manager** | Users | Business management, user management, shared media, impersonation of users |
| **User** | — | Own business's screens, products, menu screens; shared media (read-only) |

### Key Entities

| Entity | Storage | Description |
|--------|---------|-------------|
| **Business** | Our DB | A named group (e.g., "Tony's Ices"). Users and screens belong to businesses. |
| **Screen** | Our DB + Xibo Display | A physical screen. Maps 1:1 to a Xibo display. Belongs to a business. |
| **Shared Media** | Xibo folder | Curated product photos (transparent PNGs) managed by owners/managers. Read-only for users. |
| **Business Media** | Xibo folder | Per-business image uploads. Writable by the business's users. |
| **Product** | Xibo (menu board products) | A product with name, image, price, availability. Belongs to a business via its Xibo menu board. |
| **Menu Screen** | Our DB + Xibo Layout | A display page with ordered products using a layout template. Scheduled to cycle on screens. |
| **Layout Template** | Xibo Layout | Pre-made layout templates with a fixed max product count. Created outside this system. |

---

## Phase 1: Auth, Roles & Data Model

**Goal**: Extend the auth system to support the "user" role, add businesses and screens to the database, implement impersonation, and complete the invite/join flow.

### 1.1 Schema Changes

**Extend `AdminLevel` type** (`src/lib/types.ts`):

```typescript
export type AdminLevel = "owner" | "manager" | "user";
```

**New `businesses` table**:

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK AUTO | |
| `name` | TEXT NOT NULL | Encrypted. Display name, e.g., "Tony's Ices" |
| `name_index` | TEXT NOT NULL | HMAC blind index for lookups |
| `xibo_folder_id` | TEXT | Encrypted. Xibo folder ID for this business's media (set on creation) |
| `xibo_folder_name` | TEXT | Encrypted. Xibo folder name, e.g., "tonys-ices-a8f3b2" (not editable) |
| `xibo_menu_board_id` | TEXT | Encrypted. Xibo menu board ID for this business's products |

**New `business_users` table** (junction):

| Column | Type | Notes |
|--------|------|-------|
| `business_id` | INTEGER NOT NULL | FK → businesses.id |
| `user_id` | INTEGER NOT NULL | FK → users.id |
| PRIMARY KEY | (business_id, user_id) | |

**New `screens` table**:

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK AUTO | |
| `name` | TEXT NOT NULL | Encrypted. Display name, e.g., "Front Window" |
| `business_id` | INTEGER NOT NULL | FK → businesses.id |
| `xibo_display_id` | TEXT | Encrypted. Xibo display ID (linked later) |

### 1.2 Auth & Session Changes

**Impersonation**:
- Add `impersonating_user_id` column to `sessions` table (nullable INTEGER)
- When an owner/manager impersonates a user, create a new session with `impersonating_user_id` set to the target user's ID
- `getAuthenticatedSession` returns the **impersonated** user's role/context when `impersonating_user_id` is set, but preserves the original user ID for the "Stop Impersonating" action
- "Stop Impersonating" deletes the impersonation session and redirects back to the admin view
- A red banner rendered at the top of every page when impersonating (in the layout template)

**Session type extension**:
```typescript
export type AuthSession = {
  token: string;
  csrfToken: string;
  wrappedDataKey: string | null;
  userId: number;
  adminLevel: AdminLevel;
  impersonatingUserId: number | null; // The user being impersonated
  businessId: number | null;          // The user's business (for "user" role)
};
```

**Role-based route access**:
- Add `requireManagerOrOwnerOr` helper (like existing `requireOwnerOr` but also allows managers)
- Add `requireUserOr` helper that allows any authenticated role
- Update nav to show different links per role (see 1.4)

### 1.3 Invite/Join Flow

Complete the missing `/join/:inviteCode` route:

| Route | Method | Purpose |
|-------|--------|---------|
| `/join/:inviteCode` | GET | Validate invite code, render "Set Password" form |
| `/join/:inviteCode` | POST | Set password, activate user, redirect to login |

**Manager invite permissions**: Managers can create "user" class invites only. Owners can create any role. Update the POST `/admin/users` handler to enforce this.

### 1.4 Navigation Updates

**Owner/Manager nav** (admin-oriented):
- Dashboard, Businesses, Shared Media, Users (owner: all, manager: users only), Settings (owner only), Sessions (owner only), Logout

**User nav** (simplified):
- My Screens, My Products, My Media, Menu Screens, Logout

**Impersonation banner** (when `impersonatingUserId` is set):
- Red bar at top: "Impersonating [username] — Stop Impersonating"

### 1.5 Tests

- Unit tests for new DB operations (businesses CRUD, business_users CRUD, screens CRUD)
- Auth tests for "user" role access restrictions
- Impersonation session creation and teardown
- Join flow (valid invite, expired invite, invalid code)
- Manager invite restrictions (cannot create owner/manager)
- Role-based nav rendering

### 1.6 Parallelism

These sub-tasks are independent and can be developed concurrently:
- **1A**: Schema migrations + DB operations (businesses, screens, business_users)
- **1B**: Impersonation system (session changes, banner, stop-impersonating)
- **1C**: Join/invite flow (`/join/:inviteCode` route)
- **1D**: Role-based nav updates

---

## Phase 2: Business & Screen Administration

**Goal**: Admin pages for managing businesses and screens, assigning users to businesses, and integrating with Xibo displays. After this phase, owners/managers can set up the organisational structure.

### 2.1 Business Management (Owner/Manager)

| Route | Method | Role | Purpose |
|-------|--------|------|---------|
| `/admin/businesses` | GET | Owner, Manager | List all businesses |
| `/admin/businesses/new` | GET | Owner, Manager | Create business form |
| `/admin/businesses` | POST | Owner, Manager | Create business (+ Xibo folder + Xibo menu board) |
| `/admin/businesses/:id` | GET | Owner, Manager | Business detail (screens, users, Xibo folder link) |
| `/admin/businesses/:id` | POST | Owner, Manager | Update business name |
| `/admin/businesses/:id/delete` | POST | Owner | Delete business (+ cleanup Xibo folder/menu board) |

**On business creation**:
1. Generate folder name: `slugify(name)-randomSuffix(6)` (e.g., `tonys-ices-a8f3b2`)
2. Create Xibo folder via `POST /api/folder` with `text=folderName`
3. Create Xibo menu board via `POST /api/menuboard` with `name=businessName`
4. Store `xibo_folder_id`, `xibo_folder_name`, and `xibo_menu_board_id` in our DB

### 2.2 Screen Management (Owner/Manager)

| Route | Method | Role | Purpose |
|-------|--------|------|---------|
| `/admin/businesses/:id/screens/new` | GET | Owner, Manager | Add screen form |
| `/admin/businesses/:id/screens` | POST | Owner, Manager | Create screen |
| `/admin/businesses/:bid/screens/:sid` | GET | Owner, Manager | Screen detail |
| `/admin/businesses/:bid/screens/:sid` | POST | Owner, Manager | Update screen |
| `/admin/businesses/:bid/screens/:sid/delete` | POST | Owner | Delete screen |

**Xibo display integration**:
- Fetch available Xibo displays via `GET /api/display` (new endpoint to add to client)
- Present unassigned displays in a dropdown when creating/editing a screen
- Store `xibo_display_id` mapping

### 2.3 User-Business Assignment

| Route | Method | Role | Purpose |
|-------|--------|------|---------|
| `/admin/businesses/:id/users` | POST | Owner, Manager | Assign user to business |
| `/admin/businesses/:id/users/:uid/remove` | POST | Owner, Manager | Remove user from business |

Users list page (`/admin/users`) updated to show which business each user belongs to.

### 2.4 Impersonation Trigger

| Route | Method | Role | Purpose |
|-------|--------|------|---------|
| `/admin/users/:id/impersonate` | POST | Owner, Manager | Start impersonation session |

- Only owners/managers can impersonate
- Managers can only impersonate "user" role users
- Creates impersonation session and redirects to the user's dashboard

### 2.5 Xibo API Additions

New client methods needed:

```typescript
// Displays
get<XiboDisplay[]>(config, "/api/display")
get<XiboDisplay>(config, "/api/display/:id")

// Folders
post<XiboFolder>(config, "/api/folder", { text: name, parentId?: number })

// Display Groups (for scheduling in Phase 5)
get<XiboDisplayGroup[]>(config, "/api/displaygroup")
post<XiboDisplayGroup>(config, "/api/displaygroup", { displayGroup: name })
```

New types:
```typescript
interface XiboDisplay {
  displayId: number;
  display: string;        // name
  isAuditing: number;
  defaultLayoutId: number;
  licensed: number;
  loggedIn: number;
  lastAccessed: string;
  clientAddress: string;
}
```

### 2.6 Tests

- Business CRUD (create, read, update, delete)
- Screen CRUD within businesses
- User-business assignment and removal
- Impersonation trigger (permissions, session creation)
- Xibo folder creation on business creation
- Xibo display listing and mapping

### 2.7 Parallelism

These sub-tasks are independent:
- **2A**: Business CRUD routes + templates
- **2B**: Screen CRUD routes + templates
- **2C**: User-business assignment UI
- **2D**: Xibo display/folder API integration

**2A** and **2D** should be developed first since **2B** and **2C** depend on businesses existing.

---

## Phase 3: Media & Product Management

**Goal**: Implement the shared media repository, per-business media folders, and product management. After this phase, admins can populate shared images and users can manage their products.

### 3.1 Shared Media Folder

**Setup** (one-time, on first access or via admin action):
- Create a "Shared" folder in Xibo root if it doesn't exist
- Store the folder ID in our settings table (`shared_media_folder_id`)

**Owner/Manager routes**:

| Route | Method | Role | Purpose |
|-------|--------|------|---------|
| `/admin/shared-media` | GET | Owner, Manager | Browse shared media folder |
| `/admin/shared-media/upload` | POST | Owner, Manager | Upload PNG to shared folder |
| `/admin/shared-media/:id/delete` | POST | Owner, Manager | Delete shared media item |

**Constraints**: Only transparent PNGs for the shared folder. Validate on upload (check file extension and content-type).

### 3.2 Per-Business Media (User View)

**User routes**:

| Route | Method | Role | Purpose |
|-------|--------|------|---------|
| `/media` | GET | User | Browse media: shared (read-only tab) + own business (editable tab) |
| `/media/upload` | POST | User | Upload image to own business's Xibo folder |
| `/media/:id/delete` | POST | User | Delete own business media only |

**Access control**:
- User can only see media from: (a) the shared folder, (b) their own business's folder
- User can only upload to / delete from their own business's folder
- Filter Xibo media API responses by `folderId` to enforce isolation

### 3.3 Product Management

Products are stored as **Xibo menu board products** within each business's Xibo menu board. Our system provides the UI.

**User routes**:

| Route | Method | Role | Purpose |
|-------|--------|------|---------|
| `/products` | GET | User | List products in their business's menu board |
| `/products/new` | GET | User | New product form (pick image from shared or own media, set name/price) |
| `/products` | POST | User | Create product in Xibo menu board |
| `/products/:id` | GET | User | Edit product form |
| `/products/:id` | POST | User | Update product (name, price, availability, image) |
| `/products/:id/delete` | POST | User | Delete product |

**Product fields** (mapped to Xibo menu board product):

| Our field | Xibo field | Notes |
|-----------|------------|-------|
| Name | `name` | User-editable, can override shared image name |
| Image | `mediaId` | References a Xibo media item (shared or own) |
| Price | `price` | User-set, string like "3.50" |
| Available | `availability` | 1 = available, 0 = unavailable |

**Image picker UX**: When creating/editing a product, show a combined image picker with two sections: "Shared Images" (from shared folder) and "My Images" (from business folder). Selecting an image sets the `mediaId`.

### 3.4 Xibo API Additions

```typescript
// Menu board products
post<XiboProduct>(config, "/api/menuboard/{menuId}/category/{catId}/product", { name, price, availability, mediaId })
put<XiboProduct>(config, "/api/menuboard/{menuId}/product/{productId}", { name, price, availability, mediaId })
del(config, "/api/menuboard/{menuId}/product/{productId}")

// Media upload to specific folder
postMultipart(config, "/api/library", formData)  // existing, with folderId in form
```

**Category strategy**: Each business's Xibo menu board will have a single default category called "Products". We create this automatically when creating the menu board. This keeps the Xibo model simple — categories are a Xibo requirement but not user-facing.

### 3.5 Tests

- Shared media upload (PNG validation, folder targeting)
- Per-business media isolation (user can't see other businesses' media)
- Product CRUD via Xibo API
- Image picker filtering (shared + own business only)
- Access control (user can't modify shared media, can't see other businesses)

### 3.6 Parallelism

These sub-tasks are independent:
- **3A**: Shared media management (owner/manager routes)
- **3B**: Per-business media browsing and upload (user routes)
- **3C**: Product CRUD routes and templates

**3A** and **3B** can be developed in parallel. **3C** depends on media being browsable (for the image picker) but the product CRUD logic itself is independent.

---

## Phase 4: Menu Screen Builder

**Goal**: Users can create and edit menu screens that combine a layout template with their products. Each menu screen becomes a Xibo layout. After this phase, users have a complete menu authoring workflow.

### 4.1 Menu Screen Data Model

**New `menu_screens` table**:

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK AUTO | |
| `name` | TEXT NOT NULL | Encrypted. Internal name, e.g., "Summer Specials" |
| `business_id` | INTEGER NOT NULL | FK → businesses.id |
| `screen_id` | INTEGER NOT NULL | FK → screens.id |
| `template_layout_id` | TEXT NOT NULL | Encrypted. Xibo layout ID of the template to use |
| `display_order` | INTEGER NOT NULL | Order in the rotation for this screen |
| `display_time` | INTEGER NOT NULL | Seconds to show this menu screen |
| `xibo_layout_id` | TEXT | Encrypted. The generated Xibo layout ID (set after publish) |

**New `menu_screen_items` table**:

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK AUTO | |
| `menu_screen_id` | INTEGER NOT NULL | FK → menu_screens.id |
| `xibo_product_id` | TEXT NOT NULL | Encrypted. Xibo product ID reference |
| `display_order` | INTEGER NOT NULL | Order within the menu screen |

### 4.2 Layout Templates

Layout templates are pre-made Xibo layouts tagged or stored in a known location. Each template defines:
- A visual layout (grid, list, hero, etc.)
- A maximum number of product slots
- Placeholder regions for product images, names, and prices

**Template registry** (stored in `settings` table as encrypted JSON):
```typescript
interface LayoutTemplate {
  xiboLayoutId: number;
  name: string;           // e.g., "4-Item Grid", "6-Item List"
  maxProducts: number;
  description: string;
}
```

**Owner route for template management**:

| Route | Method | Role | Purpose |
|-------|--------|------|---------|
| `/admin/templates` | GET | Owner | List registered templates |
| `/admin/templates` | POST | Owner | Register a Xibo layout as a template (layout ID + name + max products) |
| `/admin/templates/:id/delete` | POST | Owner | Unregister a template |

Templates themselves are built in Xibo (or via future tooling) — this system just registers which Xibo layouts serve as templates.

### 4.3 Menu Screen Routes (User)

| Route | Method | Role | Purpose |
|-------|--------|------|---------|
| `/screens` | GET | User | List user's screens with their menu screen rotations |
| `/screens/:id` | GET | User | Screen detail: ordered list of menu screens |
| `/screens/:id/menu-screens/new` | GET | User | New menu screen form (pick template, name, display time) |
| `/screens/:id/menu-screens` | POST | User | Create menu screen |
| `/menu-screens/:id` | GET | User | Edit menu screen (name, template, time, reorder items) |
| `/menu-screens/:id` | POST | User | Update menu screen |
| `/menu-screens/:id/delete` | POST | User | Delete menu screen |
| `/menu-screens/:id/items` | POST | User | Add product to menu screen |
| `/menu-screens/:id/items/:iid/remove` | POST | User | Remove product from menu screen |
| `/menu-screens/:id/items/reorder` | POST | User | Reorder menu items |
| `/menu-screens/:id/publish` | POST | User | Generate/update Xibo layout and schedule |

### 4.4 Menu Screen ↔ Xibo Layout Generation

When a user publishes a menu screen:

1. **Read the template layout** from Xibo to understand region positions and sizes
2. **Generate a new layout** (or update existing) with the same dimensions
3. **Populate regions** with the menu screen's products:
   - Product image → image widget in the designated region
   - Product name → text widget
   - Product price → text widget
4. **Publish the layout** via `PUT /api/layout/publish/{id}`
5. **Store** the generated `xibo_layout_id` on the menu screen record

This is the most complex Xibo integration piece. The exact widget placement depends on the template structure, so the generation logic needs to read the template's regions and replicate their positions with real data.

### 4.5 Tests

- Menu screen CRUD
- Menu item ordering
- Template registration and listing
- Layout generation from template + products
- Access control (user can only manage own business's screens/menu screens)
- Display order uniqueness per screen

### 4.6 Parallelism

These sub-tasks are independent:
- **4A**: Menu screen DB model + CRUD routes
- **4B**: Template registry (admin)
- **4C**: Xibo layout generation logic

**4A** and **4B** can be developed in parallel. **4C** depends on both but is the core integration piece.

---

## Phase 5: Screen Scheduling & Live Display

**Goal**: Connect menu screens to physical Xibo displays so the screens cycle through their assigned menu layouts. After this phase, the system is end-to-end functional.

### 5.1 Scheduling Model

Each screen has an ordered list of menu screens. When any menu screen is published (or the rotation is edited), we push a **campaign** to Xibo that contains all the screen's published layouts in order.

**Xibo campaign approach**:
- Each screen gets one Xibo **campaign** (created on first publish)
- The campaign contains the screen's menu screen layouts in display order
- Each layout's duration in the campaign = the menu screen's `display_time`
- The campaign is **scheduled** to the screen's Xibo display

**New columns on `screens` table**:

| Column | Type | Notes |
|--------|------|-------|
| `xibo_campaign_id` | TEXT | Encrypted. Xibo campaign ID |

### 5.2 Scheduling Flow

When a user publishes a menu screen or reorders their rotation:

1. **Ensure campaign exists** for the screen (create via `POST /api/campaign` if not)
2. **Clear existing campaign layouts** (remove old assignments)
3. **Assign all published layouts** to the campaign in display order, with correct durations
4. **Schedule campaign** to the Xibo display (create/update schedule via `POST /api/schedule`)

### 5.3 Xibo API Additions

```typescript
// Campaigns
post<XiboCampaign>(config, "/api/campaign", { name })
get<XiboCampaign>(config, "/api/campaign/:id")
put<XiboCampaign>(config, "/api/campaign/:id", { name })
del(config, "/api/campaign/:id")

// Campaign layout assignment
post(config, "/api/campaign/:id/layout/assign", { layoutId, displayOrder, duration })
del(config, "/api/campaign/:id/layout/unassign/:layoutId")

// Schedules
post<XiboSchedule>(config, "/api/schedule", { campaignId, displayGroupIds, fromDt, toDt, ... })
get<XiboSchedule[]>(config, "/api/schedule/:displayGroupId/events")
del(config, "/api/schedule/:eventId")
```

New types:
```typescript
interface XiboCampaign {
  campaignId: number;
  campaign: string;  // name
  isLayoutSpecific: number;
  totalDuration: number;
}

interface XiboSchedule {
  eventId: number;
  campaignId: number;
  displayGroupIds: number[];
  fromDt: string;
  toDt: string;
  isPriority: number;
}
```

### 5.4 User-Facing Screen View

Update the user's screen detail page (`/screens/:id`) to show:
- Current rotation (ordered menu screens with publish status)
- "Publish All" button to push the full rotation to the display
- Last published timestamp
- Display connection status (from Xibo display API: `loggedIn`, `lastAccessed`)

### 5.5 Admin Screen Overview

Update the admin business detail page to show:
- Each screen's current campaign status
- Whether the display is connected/online
- Quick link to impersonate a user and manage their screens

### 5.6 Tests

- Campaign creation and layout assignment
- Schedule creation for displays
- Full rotation publish flow (multiple menu screens → campaign → schedule)
- Reorder and republish
- Screen status display

### 5.7 Parallelism

These sub-tasks are independent:
- **5A**: Xibo campaign/schedule API integration
- **5B**: User screen detail page updates
- **5C**: Admin screen overview updates

---

## Phase Dependencies

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5
(auth)      (business)   (media &    (menu        (scheduling)
                          products)   builder)
```

Each phase produces a working, testable system. No phase leaves broken functionality — each builds on the previous one and all existing tests continue to pass.

## Route Summary

### Admin Routes (Owner/Manager)

| Route | Phase | Purpose |
|-------|-------|---------|
| `/admin/businesses` | 2 | Business list + create |
| `/admin/businesses/:id` | 2 | Business detail (screens, users) |
| `/admin/businesses/:id/screens/*` | 2 | Screen CRUD |
| `/admin/businesses/:id/users` | 2 | User-business assignment |
| `/admin/shared-media` | 3 | Shared media management |
| `/admin/templates` | 4 | Layout template registry |
| `/admin/users/:id/impersonate` | 2 | Start impersonation |

### User Routes

| Route | Phase | Purpose |
|-------|-------|---------|
| `/join/:inviteCode` | 1 | Accept invite, set password |
| `/media` | 3 | Browse shared + own media |
| `/products` | 3 | Product management |
| `/screens` | 4 | Screen list with rotations |
| `/menu-screens/:id` | 4 | Menu screen editor |

### Existing Routes (Retained)

Current admin routes (`/admin/menuboards`, `/admin/media`, `/admin/layouts`, `/admin/datasets`) are retained as power-user tools for owners. They provide direct Xibo entity access for debugging and are hidden from the user-facing nav.

## Database Tables Summary

| Table | Phase | Purpose |
|-------|-------|---------|
| `businesses` | 1 | Business entities |
| `business_users` | 1 | User ↔ business mapping |
| `screens` | 1 | Screen entities within businesses |
| `menu_screens` | 4 | Menu screen definitions |
| `menu_screen_items` | 4 | Products within menu screens |
| `sessions` (modified) | 1 | Add `impersonating_user_id` |
| `users` (unchanged) | 1 | Add "user" to AdminLevel type |
| `settings` (extended) | 3 | `shared_media_folder_id`, template registry |
