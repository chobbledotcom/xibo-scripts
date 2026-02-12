/**
 * Shared data helpers for user routes
 *
 * Common utilities for parsing Xibo dataset rows into typed
 * products, used by both product and menu screen routes.
 */

import { map } from "#fp";
import { get } from "#xibo/client.ts";
import type { DatasetProduct, XiboConfig, XiboDatasetRow } from "#xibo/types.ts";

/** Column headings in the business dataset */
export const COL = {
  NAME: "name",
  PRICE: "price",
  MEDIA_ID: "mediaId",
  AVAILABLE: "available",
  SORT_ORDER: "sortOrder",
} as const;

/** Parse a Xibo dataset row into a typed DatasetProduct */
export const parseProduct = (row: XiboDatasetRow): DatasetProduct => ({
  id: Number(row["id"] ?? 0),
  name: String(row[COL.NAME] ?? ""),
  price: String(row[COL.PRICE] ?? "0"),
  media_id: row[COL.MEDIA_ID] !== null && row[COL.MEDIA_ID] !== ""
    ? Number(row[COL.MEDIA_ID])
    : null,
  available: Number(row[COL.AVAILABLE] ?? 1),
  sort_order: Number(row[COL.SORT_ORDER] ?? 0),
});

/** Fetch all products from a business dataset */
export const fetchProducts = async (
  config: XiboConfig,
  datasetId: number,
): Promise<DatasetProduct[]> =>
  map(parseProduct)(
    await get<XiboDatasetRow[]>(config, `dataset/data/${datasetId}`),
  );

/** Find a specific product by row ID within a dataset */
export const findProduct = async (
  config: XiboConfig,
  datasetId: number,
  rowId: number,
): Promise<DatasetProduct | null> =>
  (await fetchProducts(config, datasetId)).find((p) => p.id === rowId) ?? null;
