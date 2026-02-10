/**
 * Layout builder — auto-generates 1080x1920 portrait menu board layouts
 *
 * Ports the Ruby LayoutBuilder to TypeScript. Creates a layout with a header
 * region and a 3x4 product grid from a menu board category.
 */

import { get, post, put } from "#xibo/client.ts";
import type {
  XiboConfig,
  XiboLayout,
  XiboRegion,
  XiboResolution,
} from "#xibo/types.ts";

/** Screen dimensions for portrait menu boards */
export const SCREEN_WIDTH = 1080;
export const SCREEN_HEIGHT = 1920;

/** Header region dimensions */
export const HEADER_WIDTH = 950;
export const HEADER_HEIGHT = 250;

/** Grid configuration */
export const GRID_COLS = 3;
export const GRID_ROWS = 4;
export const GRID_TOTAL_SLOTS = GRID_COLS * GRID_ROWS;

/** Resolution name used for portrait layouts */
const RESOLUTION_NAME = "Portrait 1080x1920";

/** Position for a grid cell */
export type GridPosition = {
  top: number;
  left: number;
  width: number;
  height: number;
};

/**
 * Calculate grid positions for the product slots.
 *
 * Divides the remaining screen area (below the header) into a cols x rows
 * grid with equal spacing.
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
 * Get an existing 1080x1920 resolution or create one.
 */
export const getOrCreateResolution = async (
  config: XiboConfig,
): Promise<XiboResolution> => {
  const resolutions = await get<XiboResolution[]>(config, "resolution");
  const existing = resolutions.find(
    (r) => r.width === SCREEN_WIDTH && r.height === SCREEN_HEIGHT,
  );
  if (existing) return existing;

  return post<XiboResolution>(config, "resolution", {
    resolution: RESOLUTION_NAME,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  });
};

/** Region creation response from Xibo */
type RegionResponse = {
  regions: XiboRegion[];
};

/**
 * Create a menu layout from a category.
 *
 * 1. Get or create the 1080x1920 resolution
 * 2. Create the layout
 * 3. Create header region (centered, top)
 * 4. Create product grid regions (3x4)
 * 5. Publish the layout
 */
export const createMenuLayout = async (
  config: XiboConfig,
  categoryName: string,
  products: Array<{ name: string; price: string }>,
): Promise<XiboLayout> => {
  const resolution = await getOrCreateResolution(config);

  // Create layout
  const layoutName = `Menu - ${categoryName}`;
  const layout = await post<XiboLayout>(config, "layout", {
    name: layoutName,
    description: `Auto-generated menu board layout for ${categoryName}`,
    resolutionId: resolution.resolutionId,
  });

  const layoutId = layout.layoutId;

  // Create header region (centered horizontally)
  const headerLeft = Math.floor((SCREEN_WIDTH - HEADER_WIDTH) / 2);
  const headerRegionResponse = await post<RegionResponse>(
    config,
    `region/${layoutId}`,
    {
      width: HEADER_WIDTH,
      height: HEADER_HEIGHT,
      top: 0,
      left: headerLeft,
    },
  );

  // Add text widget to header region
  if (headerRegionResponse.regions?.[0]) {
    const headerRegion = headerRegionResponse.regions[0];
    await post(
      config,
      `playlist/widget/text/${headerRegion.regionId}`,
      { name: categoryName },
    );
  }

  // Create product grid regions
  const gridPositions = calculateGridPositions(
    GRID_COLS,
    GRID_ROWS,
    SCREEN_WIDTH,
    SCREEN_HEIGHT,
    HEADER_HEIGHT,
  );

  const productCount = Math.min(gridPositions.length, products.length);
  for (let i = 0; i < productCount; i++) {
    const pos = gridPositions[i]!;
    const product = products[i]!;

    const regionResponse = await post<RegionResponse>(
      config,
      `region/${layoutId}`,
      {
        width: pos.width,
        height: pos.height,
        top: pos.top,
        left: pos.left,
      },
    );

    if (regionResponse.regions?.[0]) {
      const region = regionResponse.regions[0];
      await post(
        config,
        `playlist/widget/text/${region.regionId}`,
        { name: `${product.name} - ${product.price}` },
      );
    }
  }

  // Publish the layout
  await put(config, `layout/publish/${layoutId}`, {});

  return layout;
};
