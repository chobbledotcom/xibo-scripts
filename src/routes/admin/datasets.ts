/**
 * Admin dataset routes — browse datasets and view details
 */

import { get } from "#xibo/client.ts";
import type {
  XiboDataset,
  XiboDatasetColumn,
  XiboDatasetRow,
} from "#xibo/types.ts";
import { ErrorCode, logError } from "#lib/logger.ts";
import { defineRoutes } from "#routes/router.ts";
import { htmlResponse } from "#routes/utils.ts";
import {
  datasetDetailPage,
  datasetListPage,
} from "#templates/admin/datasets.tsx";
import {
  detailRoute,
  fetchList,
  sessionRoute,
} from "#routes/route-helpers.ts";

// ─── Routes ──────────────────────────────────────────────────────────

/**
 * GET /admin/datasets — list all datasets
 */
const handleDatasetList = sessionRoute(async (session, config) => {
  const { items: datasets, error } = await fetchList<XiboDataset>(
    config,
    "dataset",
  );
  return htmlResponse(datasetListPage(session, datasets, error));
});

/**
 * GET /admin/dataset/:id — view dataset details with columns and sample data
 */
const handleDatasetDetail = detailRoute(
  async (session, config, params) => {
    const datasetId = params.id!;

    // Fetch dataset list to find the one we want
    const datasets = await get<XiboDataset[]>(config, "dataset", {
      dataSetId: datasetId,
    });
    const dataset = datasets[0];
    if (!dataset) {
      return htmlResponse("Dataset not found", 404);
    }

    // Fetch columns
    let columns: XiboDatasetColumn[] = [];
    try {
      columns = await get<XiboDatasetColumn[]>(
        config,
        `dataset/${datasetId}/column`,
      );
    } catch (_e) {
      logError({ code: ErrorCode.XIBO_API_REQUEST, detail: "dataset columns fetch" });
    }

    // Fetch sample data (first 10 rows)
    let rows: XiboDatasetRow[] = [];
    try {
      rows = await get<XiboDatasetRow[]>(
        config,
        `dataset/data/${datasetId}`,
        { start: "0", length: "10" },
      );
    } catch (_e) {
      logError({ code: ErrorCode.XIBO_API_REQUEST, detail: "dataset data fetch" });
    }

    return htmlResponse(
      datasetDetailPage(session, dataset, columns, rows),
    );
  },
);

/** Dataset routes */
export const datasetRoutes = defineRoutes({
  "GET /admin/datasets": handleDatasetList,
  "GET /admin/dataset/:id": handleDatasetDetail,
});
