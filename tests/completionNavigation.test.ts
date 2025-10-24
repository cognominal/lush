import { describe, expect, it } from "vitest";
import {
  computeCompletionLayout,
  buildCompletionGrid,
  navigateCompletionIndex,
} from "../src/index.ts";

describe("completion navigation helpers", () => {
  it("bounds layout rows when a maximum is supplied", () => {
    const layout = computeCompletionLayout(12, 5);
    expect(layout).toEqual({ columns: 3, rows: 4 });
  });

  it("chooses near-square layout when rows are unbounded", () => {
    const layout = computeCompletionLayout(
      9,
      Number.POSITIVE_INFINITY,
    );
    expect(layout).toEqual({ columns: 3, rows: 3 });
  });

  it("builds grids and navigates across them", () => {
    const layout = { columns: 2, rows: 3 };
    const grid = buildCompletionGrid(layout, 5);
    expect(grid).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);

    expect(navigateCompletionIndex(0, "down", grid)).toBe(1);
    expect(navigateCompletionIndex(2, "down", grid)).toBe(0);
    expect(navigateCompletionIndex(4, "left", grid)).toBe(1);
    expect(navigateCompletionIndex(1, "right", grid)).toBe(4);
    expect(navigateCompletionIndex(3, "up", grid)).toBe(4);
    expect(navigateCompletionIndex(3, "left", [[3]])).toBeNull();
  });
});
