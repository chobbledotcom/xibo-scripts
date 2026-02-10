/**
 * Layout admin page templates
 */

import type { AdminSession } from "#lib/types.ts";
import type {
  XiboCategory,
  XiboLayout,
  XiboMenuBoard,
} from "#xibo/types.ts";
import {
  calculateGridPositions,
  GRID_COLS,
  GRID_ROWS,
  HEADER_HEIGHT,
  HEADER_WIDTH,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
} from "#xibo/layout-builder.ts";
import { Layout } from "#templates/layout.tsx";
import { AdminNav, Breadcrumb } from "#templates/admin/nav.tsx";

/** Human-readable layout status */
const statusLabel = (status: number): string => {
  switch (status) {
    case 1:
      return "Published";
    case 2:
      return "Draft";
    case 3:
      return "Pending Approval";
    default:
      return `Status ${status}`;
  }
};

/** CSS class for status badge */
const statusClass = (status: number): string => {
  switch (status) {
    case 1:
      return "color:green";
    case 2:
      return "color:orange";
    default:
      return "";
  }
};

/**
 * Layout list page
 */
export const layoutListPage = (
  session: AdminSession,
  layouts: XiboLayout[],
  success?: string,
  error?: string,
): string =>
  String(
    <Layout title="Layouts">
      <AdminNav session={session} />
      <h2>Layouts</h2>

      {success && <div class="success">{success}</div>}
      {error && <div class="error">{error}</div>}

      <p>
        <a href="/admin/layout/create">Create Layout</a>
      </p>

      {layouts.length === 0
        ? <p>No layouts found.</p>
        : (
          <div>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Dimensions</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {layouts.map((layout) => (
                  <tr>
                    <td>
                      <a href={`/admin/layout/${layout.layoutId}`}>
                        {layout.layout}
                      </a>
                    </td>
                    <td>
                      {layout.width}x{layout.height}
                    </td>
                    <td style={statusClass(layout.publishedStatusId)}>
                      {statusLabel(layout.publishedStatusId)}
                    </td>
                    <td>
                      <a href={`/admin/layout/${layout.layoutId}`}>View</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              {layouts.length} layout{layouts.length !== 1 ? "s" : ""}
            </p>

            <form
              method="POST"
              action="/admin/layouts/delete-all"
            >
              <input
                type="hidden"
                name="csrf_token"
                value={session.csrfToken}
              />
              <button type="submit" class="error">
                Delete All Layouts
              </button>
            </form>
          </div>
        )}
    </Layout>,
  );

/**
 * Layout detail page with grid visualization
 */
export const layoutDetailPage = (
  session: AdminSession,
  layout: XiboLayout,
): string => {
  const gridPositions = calculateGridPositions(
    GRID_COLS,
    GRID_ROWS,
    SCREEN_WIDTH,
    SCREEN_HEIGHT,
    HEADER_HEIGHT,
  );

  const scale = 0.3;
  const scaledWidth = Math.round(SCREEN_WIDTH * scale);
  const scaledHeight = Math.round(SCREEN_HEIGHT * scale);
  const headerLeft = Math.floor((SCREEN_WIDTH - HEADER_WIDTH) / 2);

  return String(
    <Layout title={layout.layout}>
      <AdminNav session={session} />
      <Breadcrumb href="/admin/layouts" label="Layouts" />
      <h2>{layout.layout}</h2>

      <section>
        <table>
          <tbody>
            <tr>
              <th>ID</th>
              <td>{layout.layoutId}</td>
            </tr>
            <tr>
              <th>Name</th>
              <td>{layout.layout}</td>
            </tr>
            <tr>
              <th>Description</th>
              <td>{layout.description || "—"}</td>
            </tr>
            <tr>
              <th>Dimensions</th>
              <td>
                {layout.width}x{layout.height}
              </td>
            </tr>
            <tr>
              <th>Status</th>
              <td style={statusClass(layout.publishedStatusId)}>
                {statusLabel(layout.publishedStatusId)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>Grid Preview</h3>
        <div
          style={`position:relative;width:${scaledWidth}px;height:${scaledHeight}px;border:1px solid #ccc;background:#f5f5f5`}
        >
          <div
            style={`position:absolute;top:0;left:${Math.round(headerLeft * scale)}px;width:${Math.round(HEADER_WIDTH * scale)}px;height:${Math.round(HEADER_HEIGHT * scale)}px;border:1px solid #333;background:#ddd;display:flex;align-items:center;justify-content:center;font-size:10px;overflow:hidden`}
          >
            Header
          </div>
          {gridPositions.map((pos, i) => (
            <div
              style={`position:absolute;top:${Math.round(pos.top * scale)}px;left:${Math.round(pos.left * scale)}px;width:${Math.round(pos.width * scale)}px;height:${Math.round(pos.height * scale)}px;border:1px solid #999;display:flex;align-items:center;justify-content:center;font-size:9px;overflow:hidden`}
            >
              {i + 1}
            </div>
          ))}
        </div>
      </section>

      <section>
        <form
          method="POST"
          action={`/admin/layout/${layout.layoutId}/delete`}
        >
          <input type="hidden" name="csrf_token" value={session.csrfToken} />
          <button type="submit" class="error">Delete Layout</button>
        </form>
      </section>
    </Layout>,
  );
};

/**
 * Layout creation form — select a category to generate layout for
 */
export const layoutCreatePage = (
  session: AdminSession,
  _boards: XiboMenuBoard[],
  categories: Array<{
    board: XiboMenuBoard;
    category: XiboCategory;
  }>,
  error?: string,
): string =>
  String(
    <Layout title="Create Layout">
      <AdminNav session={session} />
      <Breadcrumb href="/admin/layouts" label="Layouts" />
      <h2>Create Layout</h2>

      {error && <div class="error">{error}</div>}

      <p>
        Select a menu board category to auto-generate a 1080x1920 portrait
        layout with a header and 3x4 product grid.
      </p>

      {categories.length === 0
        ? (
          <p>
            No menu board categories available.{" "}
            <a href="/admin/menuboards">Create a menu board</a> first.
          </p>
        )
        : (
          <form method="POST" action="/admin/layout/create">
            <input
              type="hidden"
              name="csrf_token"
              value={session.csrfToken}
            />
            <label>
              Category
              <select name="category" required>
                <option value="">Select a category...</option>
                {categories.map(({ board, category }) => (
                  <option
                    value={`${board.menuBoardId}:${category.menuCategoryId}`}
                  >
                    {board.name} — {category.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Generate Layout</button>
          </form>
        )}
    </Layout>,
  );
