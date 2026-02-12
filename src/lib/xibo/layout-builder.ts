/**
 * Layout builder — generates 1080x1920 portrait menu board layouts
 *
 * Ports the Ruby LayoutBuilder to TypeScript. Creates layouts with a
 * header region at top and a 3x4 product grid filling the remaining space.
 */

import { logAuditEvent } from "#lib/db/audit-events.ts";
import { get, post, put } from "#xibo/client.ts";
import type {
  XiboConfig,
  XiboLayout,
  XiboRegion,
  XiboResolution,
} from "#xibo/types.ts";

/** Screen dimensions (portrait orientation) */
export const SCREEN_WIDTH = 1080;
export const SCREEN_HEIGHT = 1920;

/** Header region dimensions */
export const HEADER_WIDTH = 950;
export const HEADER_HEIGHT = 250;

/** Product grid configuration */
export const GRID_COLS = 3;
export const GRID_ROWS = 4;
export const GRID_TOTAL_SLOTS = GRID_COLS * GRID_ROWS;

/** Position of a region on the layout */
export type GridPosition = {
  top: number;
  left: number;
  width: number;
  height: number;
};

/**
 * Calculate header position (centered at top of screen).
 */
export const calculateHeaderPosition = (): GridPosition => ({
  top: 0,
  left: Math.floor((SCREEN_WIDTH - HEADER_WIDTH) / 2),
  width: HEADER_WIDTH,
  height: HEADER_HEIGHT,
});

/**
 * Calculate grid cell positions for the product grid.
 *
 * The grid fills the area below the header. Each cell is evenly
 * distributed across the available width and height.
 */
export const calculateGridPositions = (
  cols: number,
  rows: number,
  screenWidth: number,
  screenHeight: number,
  headerHeight: number,
): GridPosition[] => {
  const availableHeight = screenHeight - headerHeight;
  const cellWidth = Math.floor(screenWidth / cols);
  const cellHeight = Math.floor(availableHeight / rows);

  const positions: GridPosition[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      positions.push({
        top: headerHeight + row * cellHeight,
        left: col * cellWidth,
        width: cellWidth,
        height: cellHeight,
      });
    }
  }
  return positions;
};

/**
 * Get or create a resolution matching the given dimensions.
 */
export const getOrCreateResolution = async (
  config: XiboConfig,
  width: number,
  height: number,
): Promise<XiboResolution> => {
  const resolutions = await get<XiboResolution[]>(config, "resolution");
  const existing = resolutions.find(
    (r) => r.width === width && r.height === height,
  );
  if (existing) return existing;

  return post<XiboResolution>(config, "resolution", {
    resolution: `${width}x${height}`,
    width,
    height,
  });
};

/**
 * Xibo layout status codes mapped to display labels.
 */
export const LAYOUT_STATUS_LABELS: Record<number, string> = {
  1: "Draft",
  2: "Pending Approval",
  3: "Published",
  4: "Invalid",
};

/**
 * Get human-readable status label for a layout status code.
 */
export const layoutStatusLabel = (status: number): string =>
  LAYOUT_STATUS_LABELS[status] ?? `Unknown (${status})`;

/** Product data needed for layout region widgets */
export type RegionProduct = { name: string; price: string };

/**
 * Create a header region with a text widget on a layout.
 * Returns the created region.
 */
export const createHeaderRegion = async (
  config: XiboConfig,
  layoutId: number,
  headerPos: GridPosition,
  label: string,
): Promise<XiboRegion> => {
  const region = await post<XiboRegion>(
    config,
    `region/${layoutId}`,
    {
      width: headerPos.width,
      height: headerPos.height,
      top: headerPos.top,
      left: headerPos.left,
    },
  );
  await post(config, `playlist/widget/text/${region.regionId}`, {
    name: label,
    duration: 0,
  });
  return region;
};

/**
 * Create product grid regions on a layout.
 * Each position gets a region; if a matching product exists, a text widget is added.
 */
export const createProductGridRegions = async (
  config: XiboConfig,
  layoutId: number,
  positions: GridPosition[],
  products: RegionProduct[],
): Promise<void> => {
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i]!;
    const product = products[i];

    const region = await post<XiboRegion>(config, `region/${layoutId}`, {
      width: pos.width,
      height: pos.height,
      top: pos.top,
      left: pos.left,
    });

    if (product) {
      await post(config, `playlist/widget/text/${region.regionId}`, {
        name: `${product.name} - ${product.price}`,
        duration: 0,
      });
    }
  }
};

/**
 * Create a full menu board layout with header and product grid.
 *
 * 1. Get or create 1080x1920 resolution
 * 2. Create layout
 * 3. Create header region with category name
 * 4. Create product grid regions
 * 5. Publish layout
 */
export const createMenuLayout = async (
  config: XiboConfig,
  categoryName: string,
  products: RegionProduct[],
  actorUserId: number,
): Promise<XiboLayout> => {
  // 1. Resolution
  const resolution = await getOrCreateResolution(
    config,
    SCREEN_WIDTH,
    SCREEN_HEIGHT,
  );

  // 2. Create layout
  const layoutName = `Menu - ${categoryName}`;
  const layout = await post<XiboLayout>(config, "layout", {
    name: layoutName,
    description: `Auto-generated menu board layout for ${categoryName}`,
    resolutionId: resolution.resolutionId,
  });

  // 3. Header region
  await createHeaderRegion(
    config,
    layout.layoutId,
    calculateHeaderPosition(),
    categoryName,
  );

  // 4. Product grid
  const gridPositions = calculateGridPositions(
    GRID_COLS,
    GRID_ROWS,
    SCREEN_WIDTH,
    SCREEN_HEIGHT,
    HEADER_HEIGHT,
  );
  await createProductGridRegions(config, layout.layoutId, gridPositions, products);

  // 5. Publish
  await put(config, `layout/publish/${layout.layoutId}`, {});
  await logAuditEvent({
    actorUserId,
    action: "CREATE",
    resourceType: "menu_screen",
    resourceId: layout.layoutId,
    detail: `Created layout "${layoutName}"`,
  });

  return layout;
};
