/**
 * Dataset admin page templates
 */

import type { AdminSession } from "#lib/types.ts";
import type {
  XiboDataset,
  XiboDatasetColumn,
  XiboDatasetRow,
} from "#xibo/types.ts";
import { Layout } from "#templates/layout.tsx";
import { AdminNav, Breadcrumb } from "#templates/admin/nav.tsx";

/**
 * Data type ID to label mapping (from Xibo CMS).
 */
const dataTypeLabel = (typeId: number): string => {
  const labels: Record<number, string> = {
    1: "String",
    2: "Number",
    3: "Date",
    4: "External Image",
    5: "Library Image",
  };
  return labels[typeId] ?? `Type ${typeId}`;
};

/**
 * Dataset list page — table of all datasets
 */
export const datasetListPage = (
  session: AdminSession,
  datasets: XiboDataset[],
  error?: string,
): string =>
  String(
    <Layout title="Datasets">
      <AdminNav session={session} />
      <h2>Datasets</h2>

      {error && <div class="error">{error}</div>}

      {datasets.length === 0
        ? <p>No datasets found.</p>
        : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Description</th>
                <th>Columns</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((ds) => (
                <tr>
                  <td>
                    <a href={`/admin/dataset/${ds.dataSetId}`}>
                      {ds.dataSet}
                    </a>
                  </td>
                  <td>{ds.code || "—"}</td>
                  <td>{ds.description || "—"}</td>
                  <td>{ds.columnCount ?? ds.columns?.length ?? 0}</td>
                  <td>
                    <a href={`/admin/dataset/${ds.dataSetId}`}>View</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      <p>{datasets.length} dataset{datasets.length !== 1 ? "s" : ""}</p>
    </Layout>,
  );

/**
 * Dataset detail page — columns and sample data
 */
export const datasetDetailPage = (
  session: AdminSession,
  dataset: XiboDataset,
  columns: XiboDatasetColumn[],
  rows: XiboDatasetRow[],
): string =>
  String(
    <Layout title={dataset.dataSet}>
      <AdminNav session={session} />
      <Breadcrumb href="/admin/datasets" label="Datasets" />
      <h2>{dataset.dataSet}</h2>

      <section>
        <table>
          <tbody>
            <tr>
              <th>ID</th>
              <td>{dataset.dataSetId}</td>
            </tr>
            <tr>
              <th>Name</th>
              <td>{dataset.dataSet}</td>
            </tr>
            <tr>
              <th>Code</th>
              <td>{dataset.code || "—"}</td>
            </tr>
            <tr>
              <th>Description</th>
              <td>{dataset.description || "—"}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>Columns ({columns.length})</h3>
        {columns.length === 0
          ? <p>No columns defined.</p>
          : (
            <table>
              <thead>
                <tr>
                  <th>Heading</th>
                  <th>Type</th>
                  <th>Order</th>
                </tr>
              </thead>
              <tbody>
                {columns.map((col) => (
                  <tr>
                    <td>{col.heading}</td>
                    <td>{dataTypeLabel(col.dataTypeId)}</td>
                    <td>{col.columnOrder}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </section>

      <section>
        <h3>Sample Data (first 10 rows)</h3>
        {rows.length === 0
          ? <p>No data rows.</p>
          : (
            <table>
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th>{col.heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr>
                    {columns.map((col) => (
                      <td>{String(row[col.heading] ?? "—")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </section>
    </Layout>,
  );
