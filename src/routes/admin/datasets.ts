/**
 * Admin dataset routes — browse and view datasets from the Xibo CMS
 */

import { get, loadXiboConfig } from "#xibo/client.ts";
import type { XiboConfig, XiboDataset } from "#xibo/types.ts";
import { defineRoutes, type RouteParams } from "#routes/router.ts";
import {
  htmlResponse,
  redirect,
  requireSessionOr,
} from "#routes/utils.ts";
import {
  type DatasetColumn,
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
    return redirect("/admin/settings?error=Xibo+API+not+configured");
  }
  return handler(config);
};

/**
 * Extract error message from an unknown thrown value.
 */
function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unknown error";
}

// ─── List ────────────────────────────────────────────────────────────

/**
 * GET /admin/datasets — list all datasets
 */
const handleDatasetList = (request: Request): Promise<Response> =>
  requireSessionOr(request, (session) =>
    withXiboConfig(async (config) => {
      const url = new URL(request.url);
      const success = url.searchParams.get("success") || undefined;
      let datasets: XiboDataset[] = [];
      let error: string | undefined;
      try {
        datasets = await get<XiboDataset[]>(config, "dataset");
      } catch (e) {
        error = errorMessage(e);
      }
      return htmlResponse(datasetListPage(session, datasets, success, error));
    }),
  );

// ─── Detail ──────────────────────────────────────────────────────────

/** Maximum number of sample data rows to display */
const MAX_SAMPLE_ROWS = 10;

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

      // Fetch dataset info
      const datasets = await get<XiboDataset[]>(config, "dataset", {
        dataSetId: datasetId,
      });
      const dataset = datasets[0];
      if (!dataset) return htmlResponse("Dataset not found", 404);

      // Fetch columns
      let columns: DatasetColumn[] = [];
      try {
        columns = await get<DatasetColumn[]>(
          config,
          `dataset/${datasetId}/column`,
        );
      } catch {
        // Some datasets may not have accessible columns
      }

      // Fetch sample data
      let sampleData: Record<string, unknown>[] = [];
      try {
        sampleData = await get<Record<string, unknown>[]>(
          config,
          `dataset/data/${datasetId}`,
        );
        sampleData = sampleData.slice(0, MAX_SAMPLE_ROWS);
      } catch {
        // Dataset may not have accessible data
      }

      return htmlResponse(
        datasetDetailPage(session, dataset, columns, sampleData),
      );
    }),
  );

// ─── Route Definitions ──────────────────────────────────────────────

/** Dataset routes */
export const datasetRoutes = defineRoutes({
  "GET /admin/datasets": (request) => handleDatasetList(request),
  "GET /admin/dataset/:id": (request, params) =>
    handleDatasetDetail(request, params),
});
