/**
 * Tests for the layout builder module
 */

import { describe, expect, test } from "#test-compat";
import {
  calculateGridPositions,
  GRID_COLS,
  GRID_ROWS,
  GRID_TOTAL_SLOTS,
  HEADER_HEIGHT,
  HEADER_WIDTH,
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

  test("grid is 3 columns by 4 rows (12 slots)", () => {
    expect(GRID_COLS).toBe(3);
    expect(GRID_ROWS).toBe(4);
    expect(GRID_TOTAL_SLOTS).toBe(12);
  });
});

describe("calculateGridPositions", () => {
  test("returns correct number of positions for default grid", () => {
    const positions = calculateGridPositions(
      GRID_COLS,
      GRID_ROWS,
      SCREEN_WIDTH,
      SCREEN_HEIGHT,
      HEADER_HEIGHT,
    );
    expect(positions.length).toBe(GRID_TOTAL_SLOTS);
  });

  test("first position starts at header height", () => {
    const positions = calculateGridPositions(
      GRID_COLS,
      GRID_ROWS,
      SCREEN_WIDTH,
      SCREEN_HEIGHT,
      HEADER_HEIGHT,
    );
    expect(positions[0]!.top).toBe(HEADER_HEIGHT);
    expect(positions[0]!.left).toBe(0);
  });

  test("cells divide screen width evenly", () => {
    const positions = calculateGridPositions(
      GRID_COLS,
      GRID_ROWS,
      SCREEN_WIDTH,
      SCREEN_HEIGHT,
      HEADER_HEIGHT,
    );
    const cellWidth = Math.floor(SCREEN_WIDTH / GRID_COLS);
    expect(positions[0]!.width).toBe(cellWidth);
    expect(positions[1]!.width).toBe(cellWidth);
    expect(positions[2]!.width).toBe(cellWidth);
  });

  test("cells divide remaining height evenly", () => {
    const positions = calculateGridPositions(
      GRID_COLS,
      GRID_ROWS,
      SCREEN_WIDTH,
      SCREEN_HEIGHT,
      HEADER_HEIGHT,
    );
    const availableHeight = SCREEN_HEIGHT - HEADER_HEIGHT;
    const cellHeight = Math.floor(availableHeight / GRID_ROWS);
    expect(positions[0]!.height).toBe(cellHeight);
  });

  test("positions in same row have same top value", () => {
    const positions = calculateGridPositions(
      GRID_COLS,
      GRID_ROWS,
      SCREEN_WIDTH,
      SCREEN_HEIGHT,
      HEADER_HEIGHT,
    );
    // First row: indices 0, 1, 2
    expect(positions[0]!.top).toBe(positions[1]!.top);
    expect(positions[1]!.top).toBe(positions[2]!.top);
    // Second row: indices 3, 4, 5
    expect(positions[3]!.top).toBe(positions[4]!.top);
    expect(positions[4]!.top).toBe(positions[5]!.top);
  });

  test("positions in same column have same left value", () => {
    const positions = calculateGridPositions(
      GRID_COLS,
      GRID_ROWS,
      SCREEN_WIDTH,
      SCREEN_HEIGHT,
      HEADER_HEIGHT,
    );
    // First column: indices 0, 3, 6, 9
    expect(positions[0]!.left).toBe(positions[3]!.left);
    expect(positions[3]!.left).toBe(positions[6]!.left);
    expect(positions[6]!.left).toBe(positions[9]!.left);
  });

  test("second column left offset equals cell width", () => {
    const positions = calculateGridPositions(
      GRID_COLS,
      GRID_ROWS,
      SCREEN_WIDTH,
      SCREEN_HEIGHT,
      HEADER_HEIGHT,
    );
    const cellWidth = Math.floor(SCREEN_WIDTH / GRID_COLS);
    expect(positions[1]!.left).toBe(cellWidth);
  });

  test("second row top offset equals header height plus cell height", () => {
    const positions = calculateGridPositions(
      GRID_COLS,
      GRID_ROWS,
      SCREEN_WIDTH,
      SCREEN_HEIGHT,
      HEADER_HEIGHT,
    );
    const availableHeight = SCREEN_HEIGHT - HEADER_HEIGHT;
    const cellHeight = Math.floor(availableHeight / GRID_ROWS);
    expect(positions[3]!.top).toBe(HEADER_HEIGHT + cellHeight);
  });

  test("works with different grid sizes", () => {
    const positions = calculateGridPositions(2, 2, 100, 200, 50);
    expect(positions.length).toBe(4);
    expect(positions[0]!.width).toBe(50);
    expect(positions[0]!.height).toBe(75);
    expect(positions[0]!.top).toBe(50);
    expect(positions[0]!.left).toBe(0);
    expect(positions[1]!.left).toBe(50);
    expect(positions[2]!.top).toBe(125);
    expect(positions[3]!.top).toBe(125);
    expect(positions[3]!.left).toBe(50);
  });

  test("produces 1x1 grid with single cell", () => {
    const positions = calculateGridPositions(1, 1, 100, 200, 0);
    expect(positions.length).toBe(1);
    expect(positions[0]!.top).toBe(0);
    expect(positions[0]!.left).toBe(0);
    expect(positions[0]!.width).toBe(100);
    expect(positions[0]!.height).toBe(200);
  });
});
