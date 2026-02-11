# Phase 5: Menu Screen Builder & Display Scheduling

> Part 5 of 5 — [Overview](IMPROVEMENT_DOC.md) · [Part 1](IMPROVEMENT_PART1.md) · [Part 2](IMPROVEMENT_PART2.md) · [Part 3](IMPROVEMENT_PART3.md) · [Part 4](IMPROVEMENT_PART4.md) · **Part 5**

**Goal**: Users create menu screens from layout templates, assign products to them, and the system publishes rotations to Xibo displays.

**Depends on**: Phase 4

---

## 5.1 Layout Templates

**Template registry** (`src/lib/templates/index.ts`):
- Each template has: `id`, `name`, `maxProducts`, `thumbnail` (optional), and a `build(products)` function
- Templates generate Xibo layout XML (extending the existing `layout-builder.ts` pattern)
- Initially ship with 1-2 simple templates; more will be designed later
- Template definitions are code, not user-configurable

## 5.2 Menu Screen Management

**Routes** (`src/routes/user/menu-screens.ts`):

| Route | Method | Description |
|-------|--------|-------------|
| `/dashboard/business/:bizId/screen/:screenId/menus` | GET | List menu screens for a screen |
| `/dashboard/business/:bizId/screen/:screenId/menu/create` | GET | Create form (template picker, product picker) |
| `/dashboard/business/:bizId/screen/:screenId/menu/create` | POST | Create menu screen + Xibo layout |
| `/dashboard/business/:bizId/screen/:screenId/menu/:id` | GET | Edit menu screen |
| `/dashboard/business/:bizId/screen/:screenId/menu/:id` | POST | Update menu screen + rebuild Xibo layout |
| `/dashboard/business/:bizId/screen/:screenId/menu/:id/delete` | POST | Delete menu screen + Xibo layout |

**Create/edit flow**:
1. User picks a layout template (shown with name, max products, preview)
2. User selects products from their business's product list (up to template max)
3. User sets: name (internal), display time (seconds), order
4. System generates a Xibo layout from the template + selected products
5. System creates/updates the layout via Xibo API (`POST /layout` or `PUT /layout/{id}`)
6. Stores `xibo_layout_id` in our `menu_screens` table

**Menu screen fields**:

| Field | Description |
|-------|-------------|
| `name` | Internal label (not shown on display) |
| `sort_order` | Rotation order on the screen |
| `template_id` | Which layout template to use |
| `display_time` | How long to show (seconds) |
| Menu items | Selected products with per-screen ordering |

## 5.3 Display Scheduling

When menu screens are created, updated, or deleted for a screen, the system must update the Xibo schedule:

1. **Build campaign**: Collect all menu screens for the screen, ordered by `sort_order`
2. **Create/update Xibo campaign**: `POST /campaign` with the layouts and durations
3. **Schedule on display**: `POST /schedule` to assign the campaign to the screen's Xibo display
4. **On change**: Rebuild the campaign and re-schedule

**Xibo API operations**:
- `POST /layout` — create layout from template
- `PUT /layout/{id}` — update layout content
- `DELETE /layout/{id}` — remove layout
- `POST /campaign` — create layout rotation
- `PUT /campaign/{id}` — update rotation
- `POST /schedule` — assign campaign to display
- `GET /schedule` — check existing schedules

## 5.4 Publish Flow

Changes are automatic — no explicit "publish" button needed:
1. User modifies a menu screen → layout is rebuilt in Xibo
2. Campaign is updated with new layout list/ordering
3. Xibo players poll for updates and apply automatically
4. The screen on-site refreshes on its next poll cycle

## 5.5 Tests

- Template registry and template rendering
- Menu screen CRUD with Xibo layout creation (mock API)
- Product selection respects template max
- Campaign creation from ordered menu screens
- Schedule assignment to Xibo display
- Rebuild on menu screen change (add/remove/reorder)
- Delete cascade (menu screen deletion removes Xibo layout)
- Access control: user can only manage their own screens' menus
- End-to-end: create business → add screen → add products → create menu screens → verify Xibo state

## Definition of Done

- Users can create menu screens from templates
- Product picker with template-appropriate limits
- Xibo layouts generated and published automatically
- Screen rotation (campaign) managed automatically
- Full end-to-end flow working
- `deno task precommit` passes with 100% coverage
