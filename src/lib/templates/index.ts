/**
 * Layout template registry
 *
 * Templates define how products are laid out on a Xibo display.
 * Each template has a build function that generates Xibo layout
 * regions and widgets from a list of products.
 */

import { post, put } from "#xibo/client.ts";
import {
  calculateGridPositions,
  calculateHeaderPosition,
  createHeaderRegion,
  createProductGridRegions,
  getOrCreateResolution,
  GRID_COLS,
  GRID_ROWS,
  HEADER_HEIGHT,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
} from "#xibo/layout-builder.ts";
import type { GridPosition, RegionProduct } from "#xibo/layout-builder.ts";
import type { XiboConfig, XiboLayout } from "#xibo/types.ts";

/** A product to be rendered in a layout (re-exported from layout-builder) */
export type TemplateProduct = RegionProduct;

/** Layout template definition */
export type LayoutTemplate = {
  id: string;
  name: string;
  maxProducts: number;
  description: string;
};

/** All available layout templates */
export const TEMPLATES: LayoutTemplate[] = [
  {
    id: "grid-3x4",
    name: "3x4 Grid",
    maxProducts: 12,
    description: "Classic 3-column, 4-row product grid with header",
  },
  {
    id: "list-6",
    name: "Simple List",
    maxProducts: 6,
    description: "Single-column list of up to 6 products",
  },
];

/** Lookup a template by ID */
export const getTemplateById = (id: string): LayoutTemplate | undefined =>
  TEMPLATES.find((t) => t.id === id);

/** Build a template by creating a header region and product grid regions */
const buildTemplateRegions = async (
  config: XiboConfig,
  layoutId: number,
  headerPos: GridPosition,
  label: string,
  gridPositions: GridPosition[],
  products: TemplateProduct[],
): Promise<void> => {
  await createHeaderRegion(config, layoutId, headerPos, label);
  await createProductGridRegions(config, layoutId, gridPositions, products);
};

/** Factory to create template builder from header/grid position functions */
const templateBuilder = (
  headerPos: () => GridPosition,
  gridPos: () => GridPosition[],
): ((config: XiboConfig, layoutId: number, products: TemplateProduct[]) => Promise<void>) =>
  (config, layoutId, products) =>
    buildTemplateRegions(config, layoutId, headerPos(), "Menu", gridPos(), products);

/**
 * Build a Xibo layout using the grid-3x4 template.
 * Creates a header region + 3x4 product grid.
 */
const buildGrid3x4 = templateBuilder(
  calculateHeaderPosition,
  () => calculateGridPositions(GRID_COLS, GRID_ROWS, SCREEN_WIDTH, SCREEN_HEIGHT, HEADER_HEIGHT),
);

/** List template constants */
const LIST_ITEM_COUNT = 6;
const LIST_HEADER_HEIGHT = 200;
const LIST_ITEM_WIDTH = 900;

/** Compute list header position centered horizontally */
const listHeaderPosition = (): GridPosition => ({
  width: LIST_ITEM_WIDTH,
  height: LIST_HEADER_HEIGHT,
  top: 0,
  left: Math.floor((SCREEN_WIDTH - LIST_ITEM_WIDTH) / 2),
});

/** Compute vertical list item positions below the header */
const listItemPositions = (): GridPosition[] => {
  const availableHeight = SCREEN_HEIGHT - LIST_HEADER_HEIGHT;
  const itemHeight = Math.floor(availableHeight / LIST_ITEM_COUNT);
  const itemLeft = Math.floor((SCREEN_WIDTH - LIST_ITEM_WIDTH) / 2);
  return Array.from({ length: LIST_ITEM_COUNT }, (_, i) => ({
    width: LIST_ITEM_WIDTH,
    height: itemHeight,
    top: LIST_HEADER_HEIGHT + i * itemHeight,
    left: itemLeft,
  }));
};

/**
 * Build a Xibo layout using the list-6 template.
 * Creates a header region + 6 stacked list rows.
 */
const buildList6 = templateBuilder(listHeaderPosition, listItemPositions);

/** Template builder functions keyed by template ID */
const BUILDERS: Record<
  string,
  (config: XiboConfig, layoutId: number, products: TemplateProduct[]) => Promise<void>
> = {
  "grid-3x4": buildGrid3x4,
  "list-6": buildList6,
};

/**
 * Create a Xibo layout from a template and product list.
 *
 * 1. Get or create the standard resolution
 * 2. Create layout
 * 3. Build regions/widgets via the template builder
 * 4. Publish the layout
 *
 * Returns the created XiboLayout.
 */
export const buildLayoutFromTemplate = async (
  config: XiboConfig,
  templateId: string,
  layoutName: string,
  products: TemplateProduct[],
): Promise<XiboLayout> => {
  const builder = BUILDERS[templateId];
  if (!builder) {
    throw new Error(`Unknown template: ${templateId}`);
  }

  const resolution = await getOrCreateResolution(
    config,
    SCREEN_WIDTH,
    SCREEN_HEIGHT,
  );

  const layout = await post<XiboLayout>(config, "layout", {
    name: layoutName,
    description: `Auto-generated from template ${templateId}`,
    resolutionId: resolution.resolutionId,
  });

  await builder(config, layout.layoutId, products);
  await put(config, `layout/publish/${layout.layoutId}`, {});

  return layout;
};

