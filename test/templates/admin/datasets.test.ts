/**
 * Tests for dataset page templates
 */

import { describe, expect, test } from "#test-compat";
import {
  type DatasetColumn,
  datasetDetailPage,
  datasetListPage,
} from "#templates/admin/datasets.tsx";
import type { AdminSession } from "#lib/types.ts";
import type { XiboDataset } from "#xibo/types.ts";

const session: AdminSession = {
  csrfToken: "test-csrf-token",
  adminLevel: "owner",
};

const sampleDatasets: XiboDataset[] = [
  {
    dataSetId: 1,
    dataSet: "Menu Items",
    description: "Main menu items dataset",
    code: "MENU",
    columns: [],
    rows: [],
  },
  {
    dataSetId: 2,
    dataSet: "Specials",
    description: "",
    code: "",
    columns: [],
    rows: [],
  },
];

const sampleColumns: DatasetColumn[] = [
  { dataSetColumnId: 1, heading: "Item", dataTypeId: 1, columnOrder: 1 },
  { dataSetColumnId: 2, heading: "Price", dataTypeId: 1, columnOrder: 2 },
  { dataSetColumnId: 3, heading: "Calculated", dataTypeId: 2, columnOrder: 3 },
  { dataSetColumnId: 4, heading: "Remote", dataTypeId: 3, columnOrder: 4 },
  { dataSetColumnId: 5, heading: "Other", dataTypeId: 99, columnOrder: 5 },
];

const sampleData: Record<string, unknown>[] = [
  { Item: "Burger", Price: "9.99", Calculated: "10.99", Remote: "remote-val", Other: "other-val" },
  { Item: "Fries", Price: "4.99", Calculated: "5.49", Remote: "remote-val2", Other: "other-val2" },
];

describe("datasetListPage", () => {
  test("renders dataset list with data", () => {
    const html = datasetListPage(session, sampleDatasets);
    expect(html).toContain("Datasets");
    expect(html).toContain("Menu Items");
    expect(html).toContain("Specials");
    expect(html).toContain("MENU");
    expect(html).toContain("/admin/dataset/1");
    expect(html).toContain("/admin/dataset/2");
  });

  test("renders empty state", () => {
    const html = datasetListPage(session, []);
    expect(html).toContain("No datasets found");
  });

  test("renders success message", () => {
    const html = datasetListPage(session, [], "Operation complete");
    expect(html).toContain("Operation complete");
  });

  test("renders error message", () => {
    const html = datasetListPage(session, [], undefined, "API error");
    expect(html).toContain("API error");
  });

  test("renders dash for empty code and description", () => {
    const html = datasetListPage(session, sampleDatasets);
    // "Specials" has empty code and description, which should show —
    expect(html).toContain("—");
  });

  test("renders dataset count", () => {
    const html = datasetListPage(session, sampleDatasets);
    expect(html).toContain("2 datasets");
  });

  test("renders singular dataset count", () => {
    const html = datasetListPage(session, [sampleDatasets[0]!]);
    expect(html).toContain("1 dataset");
  });
});

describe("datasetDetailPage", () => {
  test("renders dataset details", () => {
    const html = datasetDetailPage(
      session,
      sampleDatasets[0]!,
      sampleColumns,
      sampleData,
    );
    expect(html).toContain("Menu Items");
    expect(html).toContain("MENU");
    expect(html).toContain("Main menu items dataset");
  });

  test("renders columns table with type names", () => {
    const html = datasetDetailPage(
      session,
      sampleDatasets[0]!,
      sampleColumns,
      [],
    );
    expect(html).toContain("Item");
    expect(html).toContain("Price");
    expect(html).toContain("Value");
    expect(html).toContain("Formula");
    expect(html).toContain("Remote");
    expect(html).toContain("Type 99");
  });

  test("renders sample data rows", () => {
    const html = datasetDetailPage(
      session,
      sampleDatasets[0]!,
      sampleColumns,
      sampleData,
    );
    expect(html).toContain("Burger");
    expect(html).toContain("9.99");
    expect(html).toContain("Fries");
    expect(html).toContain("4.99");
    expect(html).toContain("Showing 2 rows");
  });

  test("shows no columns message when empty", () => {
    const html = datasetDetailPage(
      session,
      sampleDatasets[0]!,
      [],
      [],
    );
    expect(html).toContain("No columns defined");
  });

  test("shows no data message when empty", () => {
    const html = datasetDetailPage(
      session,
      sampleDatasets[0]!,
      sampleColumns,
      [],
    );
    expect(html).toContain("No data rows");
  });

  test("renders breadcrumb to datasets list", () => {
    const html = datasetDetailPage(
      session,
      sampleDatasets[0]!,
      [],
      [],
    );
    expect(html).toContain("/admin/datasets");
  });

  test("shows dash for empty code and description", () => {
    const html = datasetDetailPage(
      session,
      sampleDatasets[1]!,
      [],
      [],
    );
    expect(html).toContain("—");
  });

  test("renders singular row count", () => {
    const html = datasetDetailPage(
      session,
      sampleDatasets[0]!,
      sampleColumns,
      [sampleData[0]!],
    );
    expect(html).toContain("Showing 1 row");
  });
});
