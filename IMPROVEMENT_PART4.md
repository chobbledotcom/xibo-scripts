# Phase 4: User Dashboard & Product Management

> Part 4 of 5 — [Overview](IMPROVEMENT_DOC.md) · [Part 1](IMPROVEMENT_PART1.md) · [Part 2](IMPROVEMENT_PART2.md) · [Part 3](IMPROVEMENT_PART3.md) · **Part 4** · [Part 5](IMPROVEMENT_PART5.md)

**Goal**: Build the user-facing dashboard and product management system. Products are stored in per-business Xibo datasets.

**Depends on**: Phases 2 + 3

---

## 4.1 User Dashboard

**New route module** (`src/routes/user/dashboard.ts`):

| Route | Method | Description |
|-------|--------|-------------|
| `/dashboard` | GET | User home — list businesses they belong to |
| `/dashboard/business/:id` | GET | Business overview — screens, product count |

**Dashboard content**:
- List of businesses the user belongs to
- Per business: screen count, product count, quick links
- No Xibo internals exposed (no dataset IDs, folder IDs, etc.)

## 4.2 Product Management

Products are rows in the business's Xibo dataset. Users manage them through our UI, and we sync to Xibo via the dataset API.

**Routes** (`src/routes/user/products.ts`):

| Route | Method | Description |
|-------|--------|-------------|
| `/dashboard/business/:id/products` | GET | List products for business |
| `/dashboard/business/:id/product/create` | GET | Create product form (image picker from shared + own) |
| `/dashboard/business/:id/product/create` | POST | Add row to Xibo dataset |
| `/dashboard/business/:id/product/:rowId` | GET | Edit product form |
| `/dashboard/business/:id/product/:rowId` | POST | Update dataset row in Xibo |
| `/dashboard/business/:id/product/:rowId/delete` | POST | Delete dataset row from Xibo |
| `/dashboard/business/:id/product/:rowId/toggle` | POST | Toggle availability |

**Create product flow**:
1. User picks an image from shared photos or their own uploads
2. User sets: name (pre-filled from image name if from shared, editable), price
3. System adds a row to the business's Xibo dataset: `{ name, price, media_id, available: 1, sort_order }`

**Xibo dataset API operations**:
- `GET /dataset/{id}/data` — list products (dataset rows)
- `POST /dataset/{id}/data` — add product (new row)
- `PUT /dataset/{id}/data/{rowId}` — update product
- `DELETE /dataset/{id}/data/{rowId}` — delete product

## 4.3 Access Control

- Users can only manage products for businesses they belong to
- Verify `business_users` mapping before every operation
- Products use the business's `xibo_dataset_id` — users never see this ID

## 4.4 Tests

- User dashboard rendering per business
- Product CRUD via Xibo dataset API (mock API)
- Product creation from shared photo (name pre-fill, media_id reference)
- Product creation from own photo
- Availability toggle
- Access control: user cannot access other businesses' products
- Access control: user role required (admin/manager get 403 or redirect)

## Definition of Done

- Users see a clean dashboard with their businesses
- Full product CRUD backed by Xibo datasets
- Image picker shows shared + own business photos
- Access control enforced per-business
- `deno task precommit` passes with 100% coverage
