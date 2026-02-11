/**
 * Admin dataset routes — browse datasets and view details
 */

import { get, loadXiboConfig } from "#xibo/client.ts";
import type {
  XiboConfig,
  XiboDataset,
  XiboDatasetColumn,
  XiboDatasetRow,
} from "#xibo/types.ts";
import { defineRoutes, type RouteParams } from "#routes/router.ts";
import {
  htmlResponse,
  redirect,
  requireSessionOr,
} from "#routes/utils.ts";
import {
  datasetDetailPage,
  datasetListPage,
} from "#templates/admin/datasets.tsx";

/**
 * Helper: load Xibo config or redirect to settings if not configured
 */
const withXiboConfig = async (
  handler: (config: XiboConfig) => Promise<Response>,
): Promise<Response> => {
  const config = await loadXiboConfig();
  if (!config) {
    return redirect(
      "/admin/settings?success=" +
        encodeURIComponent("Configure Xibo API credentials first"),
    );
  }
  return handler(config);
};

/** Extract error message from an unknown thrown value. */
function errorMessage(e: unknown): string { return e instanceof Error ? e.message : "Unknown error"; }

// ─── Routes ──────────────────────────────────────────────────────────

/**
 * GET /admin/datasets — list all datasets
 */
const handleDatasetList = (request: Request): Promise<Response> =>
  requireSessionOr(request, (session) =>
    withXiboConfig(async (config) => {
      let datasets: XiboDataset[] = [];
      let error: string | undefined;
      try {
        datasets = await get<XiboDataset[]>(config, "dataset");
      } catch (e) {
        error = errorMessage(e);
      }
      return htmlResponse(datasetListPage(session, datasets, error));
    }),
  );

/**
 * GET /admin/dataset/:id — view dataset details with columns and sample data
 */
const handleDatasetDetail = (
  request: Request,
  params: RouteParams,
): Promise<Response> =>
  requireSessionOr(request, (session) =>
    withXiboConfig(async (config) => {
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
      } catch {
        // columns may not be available
      }

      // Fetch sample data (first 10 rows)
      let rows: XiboDatasetRow[] = [];
      try {
        rows = await get<XiboDatasetRow[]>(
          config,
          `dataset/data/${datasetId}`,
          { start: "0", length: "10" },
        );
      } catch {
        // data may not be available
      }

      return htmlResponse(
        datasetDetailPage(session, dataset, columns, rows),
      );
    }),
  );

/** Dataset routes */
export const datasetRoutes = defineRoutes({
  "GET /admin/datasets": (request) => handleDatasetList(request),
  "GET /admin/dataset/:id": (request, params) =>
    handleDatasetDetail(request, params),
});
