/**
 * Layout admin page templates
 */

import type { AdminSession } from "#lib/types.ts";
import type { XiboLayout } from "#xibo/types.ts";
import {
  calculateGridPositions,
  calculateHeaderPosition,
  GRID_COLS,
  GRID_ROWS,
  layoutStatusLabel,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  HEADER_HEIGHT,
} from "#xibo/layout-builder.ts";
import { Layout } from "#templates/layout.tsx";
import { AdminNav, Breadcrumb } from "#templates/admin/nav.tsx";

/**
 * Layout list page — table of all layouts
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

      {layouts.length === 0
        ? <p>No layouts found.</p>
        : (
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
                  <td>{layoutStatusLabel(layout.status)}</td>
                  <td>
                    <a href={`/admin/layout/${layout.layoutId}`}>View</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      <p>{layouts.length} layout{layouts.length !== 1 ? "s" : ""}</p>
    </Layout>,
  );

/**
 * Layout detail page — info plus grid visualization
 */
export const layoutDetailPage = (
  session: AdminSession,
  layout: XiboLayout,
): string =>
  String(
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
              <td>{layoutStatusLabel(layout.status)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>Grid Preview</h3>
        <GridVisualization />
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

/**
 * CSS grid visualization of the 1080x1920 layout (scaled down).
 *
 * Shows the header at top and 3x4 grid below.
 */
const GridVisualization = (): JSX.Element => {
  const scale = 0.2;
  const containerWidth = Math.floor(SCREEN_WIDTH * scale);
  const containerHeight = Math.floor(SCREEN_HEIGHT * scale);

  const header = calculateHeaderPosition();
  const cells = calculateGridPositions(
    GRID_COLS,
    GRID_ROWS,
    SCREEN_WIDTH,
    SCREEN_HEIGHT,
    HEADER_HEIGHT,
  );

  return (
    <div
      style={`position:relative;width:${containerWidth}px;height:${containerHeight}px;border:2px solid #333;background:#f0f0f0;margin:1em 0`}
    >
      <div
        style={`position:absolute;top:${Math.floor(header.top * scale)}px;left:${Math.floor(header.left * scale)}px;width:${Math.floor(header.width * scale)}px;height:${Math.floor(header.height * scale)}px;background:#2196f3;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;border:1px solid #1976d2`}
      >
        Header
      </div>
      {cells.map((cell, i) => (
        <div
          style={`position:absolute;top:${Math.floor(cell.top * scale)}px;left:${Math.floor(cell.left * scale)}px;width:${Math.floor(cell.width * scale)}px;height:${Math.floor(cell.height * scale)}px;background:#e3f2fd;border:1px solid #90caf9;display:flex;align-items:center;justify-content:center;font-size:10px`}
        >
          {i + 1}
        </div>
      ))}
    </div>
  );
};
