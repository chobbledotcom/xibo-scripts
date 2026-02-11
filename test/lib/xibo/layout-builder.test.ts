/**
 * Tests for layout builder — grid calculations and constants
 */

import { describe, expect, test } from "#test-compat";
import {
  calculateGridPositions,
  calculateHeaderPosition,
  GRID_COLS,
  GRID_ROWS,
  GRID_TOTAL_SLOTS,
  HEADER_HEIGHT,
  HEADER_WIDTH,
  LAYOUT_STATUS_LABELS,
  layoutStatusLabel,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
} from "#xibo/layout-builder.ts";

describe("layout builder constants", () => {
  test("screen dimensions are 1080x1920 portrait", () => {
    expect(SCREEN_WIDTH).toBe(1080);
    expect(SCREEN_HEIGHT).toBe(1920);
  });

  test("header dimensions are 950x250", () => {
    expect(HEADER_WIDTH).toBe(950);
    expect(HEADER_HEIGHT).toBe(250);
  });

  test("grid is 3x4 with 12 total slots", () => {
    expect(GRID_COLS).toBe(3);
    expect(GRID_ROWS).toBe(4);
    expect(GRID_TOTAL_SLOTS).toBe(12);
  });
});

describe("calculateHeaderPosition", () => {
  test("centers header horizontally at top of screen", () => {
    const header = calculateHeaderPosition();
    expect(header.top).toBe(0);
    expect(header.left).toBe(Math.floor((SCREEN_WIDTH - HEADER_WIDTH) / 2));
    expect(header.width).toBe(HEADER_WIDTH);
    expect(header.height).toBe(HEADER_HEIGHT);
  });

  test("header left offset is 65px for 1080-950", () => {
    const header = calculateHeaderPosition();
    // (1080 - 950) / 2 = 65
    expect(header.left).toBe(65);
  });
});

describe("calculateGridPositions", () => {
  test("produces correct number of positions for 3x4 grid", () => {
    const positions = calculateGridPositions(
      GRID_COLS,
      GRID_ROWS,
      SCREEN_WIDTH,
      SCREEN_HEIGHT,
      HEADER_HEIGHT,
    );
    expect(positions.length).toBe(GRID_TOTAL_SLOTS);
  });

  test("first cell starts at header height", () => {
    const positions = calculateGridPositions(3, 4, 1080, 1920, 250);
    const first = positions[0]!;
    expect(first.top).toBe(250);
    expect(first.left).toBe(0);
  });

  test("cell width divides screen width evenly", () => {
    const positions = calculateGridPositions(3, 4, 1080, 1920, 250);
    const cellWidth = Math.floor(1080 / 3);
    for (const pos of positions) {
      expect(pos.width).toBe(cellWidth);
    }
  });

  test("cell height divides available height evenly", () => {
    const positions = calculateGridPositions(3, 4, 1080, 1920, 250);
    const cellHeight = Math.floor((1920 - 250) / 4);
    for (const pos of positions) {
      expect(pos.height).toBe(cellHeight);
    }
  });

  test("cells in the same row have the same top", () => {
    const positions = calculateGridPositions(3, 4, 1080, 1920, 250);
    // First row: indices 0, 1, 2
    expect(positions[0]!.top).toBe(positions[1]!.top);
    expect(positions[1]!.top).toBe(positions[2]!.top);
  });

  test("cells in the same column have the same left", () => {
    const positions = calculateGridPositions(3, 4, 1080, 1920, 250);
    // First column: indices 0, 3, 6, 9
    expect(positions[0]!.left).toBe(positions[3]!.left);
    expect(positions[3]!.left).toBe(positions[6]!.left);
    expect(positions[6]!.left).toBe(positions[9]!.left);
  });

  test("second column starts at cellWidth offset", () => {
    const positions = calculateGridPositions(3, 4, 1080, 1920, 250);
    const cellWidth = Math.floor(1080 / 3);
    expect(positions[1]!.left).toBe(cellWidth);
  });

  test("second row starts at headerHeight + cellHeight", () => {
    const positions = calculateGridPositions(3, 4, 1080, 1920, 250);
    const cellHeight = Math.floor((1920 - 250) / 4);
    expect(positions[3]!.top).toBe(250 + cellHeight);
  });

  test("works with different grid sizes", () => {
    const positions = calculateGridPositions(2, 2, 800, 600, 100);
    expect(positions.length).toBe(4);
    expect(positions[0]!.width).toBe(400);
    expect(positions[0]!.height).toBe(250);
  });
});

describe("layoutStatusLabel", () => {
  test("returns correct labels for known statuses", () => {
    expect(layoutStatusLabel(1)).toBe("Draft");
    expect(layoutStatusLabel(2)).toBe("Pending Approval");
    expect(layoutStatusLabel(3)).toBe("Published");
    expect(layoutStatusLabel(4)).toBe("Invalid");
  });

  test("returns fallback for unknown status", () => {
    expect(layoutStatusLabel(99)).toBe("Unknown (99)");
  });

  test("LAYOUT_STATUS_LABELS has 4 entries", () => {
    expect(Object.keys(LAYOUT_STATUS_LABELS).length).toBe(4);
  });
});
