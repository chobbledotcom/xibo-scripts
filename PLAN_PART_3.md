# Part 3: Menu Board Management

**Goal**: Full CRUD for the core menu board hierarchy (boards, categories, products) through the admin web UI.

**Depends on**: Part 2 (Xibo API client)

---

## 3.1 Menu Board Routes (`src/routes/admin/menuboards.ts`)

**Board operations**:
- `GET /admin/menuboards` - List all menu boards in a table
- `GET /admin/menuboard/new` - New board form
- `POST /admin/menuboard` - Create a new menu board
- `GET /admin/menuboard/:id` - View board detail (with categories tree)
- `GET /admin/menuboard/:id/edit` - Edit board form (pre-filled)
- `POST /admin/menuboard/:id` - Update board
- `POST /admin/menuboard/:id/delete` - Delete board (with confirmation)

**Category operations** (nested under boards):
- `GET /admin/menuboard/:boardId/category/new` - New category form
- `POST /admin/menuboard/:boardId/category` - Create category
- `GET /admin/menuboard/:boardId/category/:id/edit` - Edit category form
- `POST /admin/menuboard/:boardId/category/:id` - Update category
- `POST /admin/menuboard/:boardId/category/:id/delete` - Delete category

**Product operations** (nested under categories):
- `GET /admin/menuboard/:boardId/category/:catId/product/new` - New product form
- `POST /admin/menuboard/:boardId/category/:catId/product` - Create product
- `GET /admin/menuboard/:boardId/category/:catId/product/:id/edit` - Edit product form
- `POST /admin/menuboard/:boardId/category/:catId/product/:id` - Update product
- `POST /admin/menuboard/:boardId/category/:catId/product/:id/delete` - Delete product

## 3.2 Menu Board Templates (`src/templates/admin/menuboards.tsx`)

- **Board list page**: Table with name, code, description, category count, actions (view/edit/delete)
- **Board detail page**: Board info + tree view of categories -> products, with add/edit/delete links
- **Board form** (new/edit): Fields for name, code, description
- **Category form** (new/edit): Fields for name, code, media selection
- **Product form** (new/edit): Fields for:
  - Name (text, required)
  - Description (textarea)
  - Price (number, required)
  - Calories (number)
  - Allergy info (text)
  - Availability (checkbox/toggle)
  - Media (select from library)
- **Tree view component**: Hierarchical display of board -> categories -> products
  - Collapsible sections
  - Inline action links (edit, delete)
  - Product details shown inline (price, availability)

## 3.3 Form Field Definitions (`src/templates/fields.ts`)

- `menuBoardFields`: name (text, required), code (text), description (textarea)
- `categoryFields`: name (text, required), code (text), mediaId (select)
- `productFields`: name (text, required), description (textarea), price (number, required), calories (number), allergyInfo (text), availability (checkbox, default: true), mediaId (select)

## 3.4 Xibo API Integration

Menu board API calls via `src/lib/xibo/client.ts`:

- `GET /api/menuboards` -> list boards
- `POST /api/menuboards` -> create board (body: name, code, description)
- `PUT /api/menuboards/{id}` -> update board
- `DELETE /api/menuboards/{id}` -> delete board
- `GET /api/menuboard/{id}/category` -> list categories
- `POST /api/menuboard/{id}/category` -> create category
- `PUT /api/menuboard/{id}/category/{catId}` -> update category
- `DELETE /api/menuboard/{id}/category/{catId}` -> delete category
- `GET /api/menuboard/{boardId}/product` -> list products (filter by category)
- `POST /api/menuboard/{boardId}/product` -> create product
- `PUT /api/menuboard/{boardId}/product/{prodId}` -> update product
- `DELETE /api/menuboard/{boardId}/product/{prodId}` -> delete product

Parameter conversion: form field names (snake_case) -> API field names (camelCase):
- `allergy_info` -> `allergyInfo`
- `menu_id` -> `menuId`
- `media_id` -> `mediaId`
- etc.

## 3.5 Activity Logging

- Log all menu board operations to activity_log table:
  - Created board "X"
  - Updated category "Y" in board "X"
  - Deleted product "Z" from category "Y"
- Show recent activity on board detail page

## 3.6 Tests

- Route tests for all CRUD operations (mock Xibo API):
  - List boards (empty, with data)
  - Create board (success, validation errors, API errors)
  - Edit board (pre-fill form, save changes)
  - Delete board (confirmation, success)
  - Same for categories and products
- Template rendering tests (verify HTML output)
- Parameter conversion tests (snake_case <-> camelCase)
- Tree view component tests

## Expected Outcome

Full menu board management through the web UI. Can list, create, edit, delete boards, categories, and products. Tree view shows the hierarchy. All operations go through the Xibo API.
