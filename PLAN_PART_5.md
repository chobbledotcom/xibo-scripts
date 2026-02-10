# Part 5: Layout Builder & Dataset Operations

**Goal**: Auto-generate menu board layouts with product grids and browse datasets.

**Depends on**: Part 3 (Menu Boards) and Part 4 (Media Library)

---

## 5.1 Layout Routes (`src/routes/admin/layouts.ts`)

- `GET /admin/layouts` - List all layouts with status
  - Display: name, description, status (draft/published/etc.), dimensions, modified date
  - Actions: view, delete
- `GET /admin/layout/create` - Layout creation form
  - Select a category to generate layout for
  - Shows preview of grid positioning
- `POST /admin/layout/create` - Create layout from category
  - Auto-generate 1080x1920 portrait layout with:
    - Header region (950x250, centered at top) showing category name
    - 3x4 product grid (12 slots) filling the remaining space
    - Each product box: ~166px wide with 83px margins
    - Products populated from selected category
  - Calls Xibo API to create layout, regions, and widgets
  - Publishes layout after creation
- `GET /admin/layout/:id` - View layout details
  - Show layout info, regions, widgets
  - Visual grid representation (HTML/CSS mock of the layout)
- `POST /admin/layout/:id/delete` - Delete single layout
- `POST /admin/layouts/delete-all` - Batch delete all non-system layouts

## 5.2 Layout Builder (`src/lib/xibo/layout-builder.ts`)

Port the Ruby `LayoutBuilder` to TypeScript:

```
Constants:
  SCREEN_WIDTH = 1080
  SCREEN_HEIGHT = 1920
  HEADER_WIDTH = 950
  HEADER_HEIGHT = 250
  GRID_COLS = 3
  GRID_ROWS = 4
  GRID_TOTAL_SLOTS = 12
```

Functions:

- `createMenuLayout(categoryName, menuBoardId, products)`:
  1. Get or create 1080x1920 resolution
  2. Create layout with name derived from category
  3. Create header region (centered, top)
  4. Create product grid regions (3x4, calculated positions)
  5. Add text widgets to header and product regions
  6. Publish layout
  7. Return layout details

- `calculateGridPositions(cols, rows, screenWidth, screenHeight, headerHeight)`:
  - Calculate box width, height, margins
  - Return array of `{ top, left, width, height }` for each slot

- `getOrCreateResolution(width, height)`:
  - Check existing resolutions
  - Create if not found

## 5.3 Layout Templates (`src/templates/admin/layouts.tsx`)

- **Layout list page**: Table with status badges (draft=yellow, published=green)
- **Layout creation form**: Category dropdown, preview grid
- **Layout detail page**: Layout info + visual grid representation
  - CSS grid showing the 3x4 layout with product names in boxes
  - Header region at top
  - Exact positioning shown
- **Grid visualization component**: Reusable for both creation preview and detail view

## 5.4 Resolution Management

- `GET /api/resolution` -> list available resolutions
- Create 1080x1920 (portrait) resolution if it doesn't exist
- Support for other resolutions in the future

## 5.5 Dataset Routes (`src/routes/admin/datasets.ts`)

- `GET /admin/datasets` - List all datasets
  - Display: name, description, code, column count, row count, modified date
  - Link to Xibo CMS for full dataset editing (not replicated here)
- `GET /admin/dataset/:id` - View dataset details
  - Show columns with types
  - Show row count
  - Show sample data (first 10 rows)

## 5.6 Dataset Templates (`src/templates/admin/datasets.tsx`)

- **Dataset list page**: Table with dataset info
- **Dataset detail page**: Column definitions + sample data table

## 5.7 Xibo API Integration

Layout API calls:
- `GET /api/layout` -> list layouts
- `POST /api/layout` -> create layout (name, description, resolutionId)
- `DELETE /api/layout/{id}` -> delete layout
- `POST /api/region/{layoutId}` -> create region (width, height, top, left)
- `POST /api/playlist/widget/{type}/{playlistId}` -> create widget
- `PUT /api/layout/publish/{id}` -> publish layout

Resolution API calls:
- `GET /api/resolution` -> list resolutions
- `POST /api/resolution` -> create resolution

Dataset API calls:
- `GET /api/dataset` -> list datasets
- `GET /api/dataset/{id}` -> get dataset details
- `GET /api/dataset/data/{id}` -> get dataset rows

## 5.8 Tests

- Layout builder unit tests:
  - Grid position calculations (exact pixel values)
  - Resolution creation
  - Full layout creation flow (mock API)
- Layout route tests:
  - List layouts, create layout, delete layout
  - Batch delete
- Dataset route tests:
  - List datasets, view dataset details
- Grid visualization rendering tests

## Expected Outcome

Can auto-generate portrait menu board layouts from categories, view layout details with grid visualization, delete layouts, and browse datasets. Layout builder produces identical 1080x1920 grids to the Ruby version.
