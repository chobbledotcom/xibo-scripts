/**
 * Tests for dataset admin templates
 */

import { describe, expect, test } from "#test-compat";
import {
  datasetDetailPage,
  datasetListPage,
} from "#templates/admin/datasets.tsx";
import type {
  XiboDataset,
  XiboDatasetColumn,
  XiboDatasetRow,
} from "#xibo/types.ts";
import type { AdminSession } from "#lib/types.ts";

const session: AdminSession = {
  csrfToken: "csrf-test",
  adminLevel: "owner",
};

const sampleDatasets: XiboDataset[] = [
  {
    dataSetId: 1,
    dataSet: "Prices",
    description: "Product pricing",
    code: "prices",
    columnCount: 2,
    columns: [],
  },
  {
    dataSetId: 2,
    dataSet: "Inventory",
    description: "",
    code: "",
    columnCount: 0,
    columns: [],
  },
];

const sampleColumns: XiboDatasetColumn[] = [
  {
    dataSetColumnId: 1,
    heading: "Product",
    dataTypeId: 1,
    dataSetColumnTypeId: 1,
    listContent: "",
    columnOrder: 1,
  },
  {
    dataSetColumnId: 2,
    heading: "Price",
    dataTypeId: 2,
    dataSetColumnTypeId: 1,
    listContent: "",
    columnOrder: 2,
  },
];

const sampleRows: XiboDatasetRow[] = [
  { Product: "Burger", Price: 9.99 },
  { Product: "Fries", Price: 4.99 },
];

describe("datasetListPage", () => {
  test("renders dataset table with data", () => {
    const html = datasetListPage(session, sampleDatasets);
    expect(html).toContain("Datasets");
    expect(html).toContain("Prices");
    expect(html).toContain("Inventory");
    expect(html).toContain("Product pricing");
    expect(html).toContain("prices");
    expect(html).toContain("2 datasets");
  });

  test("renders empty state", () => {
    const html = datasetListPage(session, []);
    expect(html).toContain("No datasets found");
    expect(html).toContain("0 datasets");
  });

  test("renders singular count", () => {
    const html = datasetListPage(session, [sampleDatasets[0]!]);
    expect(html).toContain("1 dataset");
    expect(html).not.toContain("1 datasets");
  });

  test("renders error message", () => {
    const html = datasetListPage(session, [], "API error");
    expect(html).toContain("API error");
  });

  test("renders dash for empty code and description", () => {
    const html = datasetListPage(session, [sampleDatasets[1]!]);
    expect(html).toContain("—");
  });
});

describe("datasetDetailPage", () => {
  test("renders dataset detail with columns and data", () => {
    const html = datasetDetailPage(
      session,
      sampleDatasets[0]!,
      sampleColumns,
      sampleRows,
    );
    expect(html).toContain("Prices");
    expect(html).toContain("Product");
    expect(html).toContain("Price");
    expect(html).toContain("String");
    expect(html).toContain("Number");
    expect(html).toContain("Burger");
    expect(html).toContain("9.99");
    expect(html).toContain("Fries");
  });

  test("renders empty columns state", () => {
    const html = datasetDetailPage(session, sampleDatasets[0]!, [], []);
    expect(html).toContain("No columns defined");
    expect(html).toContain("No data rows");
  });

  test("renders dataset info fields", () => {
    const html = datasetDetailPage(
      session,
      sampleDatasets[0]!,
      sampleColumns,
      [],
    );
    expect(html).toContain("prices");
    expect(html).toContain("Product pricing");
  });

  test("renders dash for empty code", () => {
    const html = datasetDetailPage(
      session,
      sampleDatasets[1]!,
      [],
      [],
    );
    expect(html).toContain("—");
  });

  test("renders null values in rows as dash", () => {
    const rowsWithNull: XiboDatasetRow[] = [
      { Product: "Widget", Price: null },
    ];
    const html = datasetDetailPage(
      session,
      sampleDatasets[0]!,
      sampleColumns,
      rowsWithNull,
    );
    expect(html).toContain("Widget");
    expect(html).toContain("—");
  });

  test("renders column data types correctly", () => {
    const cols: XiboDatasetColumn[] = [
      { dataSetColumnId: 1, heading: "Date", dataTypeId: 3, dataSetColumnTypeId: 1, listContent: "", columnOrder: 1 },
      { dataSetColumnId: 2, heading: "Photo", dataTypeId: 4, dataSetColumnTypeId: 1, listContent: "", columnOrder: 2 },
      { dataSetColumnId: 3, heading: "Logo", dataTypeId: 5, dataSetColumnTypeId: 1, listContent: "", columnOrder: 3 },
      { dataSetColumnId: 4, heading: "Custom", dataTypeId: 99, dataSetColumnTypeId: 1, listContent: "", columnOrder: 4 },
    ];
    const html = datasetDetailPage(session, sampleDatasets[0]!, cols, []);
    expect(html).toContain("Date");
    expect(html).toContain("External Image");
    expect(html).toContain("Library Image");
    expect(html).toContain("Type 99");
  });
});
