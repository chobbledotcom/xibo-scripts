/**
 * Dataset admin page templates
 */

import type { AdminSession } from "#lib/types.ts";
import type { XiboDataset } from "#xibo/types.ts";
import { Layout } from "#templates/layout.tsx";
import { AdminNav, Breadcrumb } from "#templates/admin/nav.tsx";

/** Dataset column definition from the API */
export type DatasetColumn = {
  dataSetColumnId: number;
  heading: string;
  dataTypeId: number;
  columnOrder: number;
};

/** Human-readable data type name */
const dataTypeName = (typeId: number): string => {
  switch (typeId) {
    case 1:
      return "Value";
    case 2:
      return "Formula";
    case 3:
      return "Remote";
    default:
      return `Type ${typeId}`;
  }
};

/**
 * Dataset list page
 */
export const datasetListPage = (
  session: AdminSession,
  datasets: XiboDataset[],
  success?: string,
  error?: string,
): string =>
  String(
    <Layout title="Datasets">
      <AdminNav session={session} />
      <h2>Datasets</h2>

      {success && <div class="success">{success}</div>}
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
                  <td>
                    <a href={`/admin/dataset/${ds.dataSetId}`}>View</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      <p>
        {datasets.length} dataset{datasets.length !== 1 ? "s" : ""}
      </p>
    </Layout>,
  );

/**
 * Dataset detail page — columns + sample data
 */
export const datasetDetailPage = (
  session: AdminSession,
  dataset: XiboDataset,
  columns: DatasetColumn[],
  sampleData: Record<string, unknown>[],
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
        <h3>Columns</h3>
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
                    <td>{dataTypeName(col.dataTypeId)}</td>
                    <td>{col.columnOrder}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </section>

      <section>
        <h3>Sample Data</h3>
        {sampleData.length === 0
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
                {sampleData.map((row) => (
                  <tr>
                    {columns.map((col) => (
                      <td>{String(row[col.heading] ?? "—")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        {sampleData.length > 0 && (
          <p>Showing {sampleData.length} row{sampleData.length !== 1 ? "s" : ""}</p>
        )}
      </section>
    </Layout>,
  );
