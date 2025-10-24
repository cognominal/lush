export type CompletionLayout = {
  columns: number;
  rows: number;
};

export type CompletionGrid = number[][];

export type CompletionDirection = "up" | "down" | "left" | "right";

export function computeCompletionLayout(
  length: number,
  maxRows: number,
): CompletionLayout {
  if (!Number.isFinite(maxRows)) {
    const columns = Math.max(1, Math.floor(Math.sqrt(length)) || 1);
    const rows = Math.ceil(length / columns) || 1;
    return { columns, rows };
  }
  for (let columns = 1; columns <= Math.max(1, length); columns++) {
    const rows = Math.ceil(length / columns);
    if (rows <= maxRows) {
      return { columns, rows };
    }
  }
  return { columns: 1, rows: Math.max(1, length) };
}

export function buildCompletionGrid(
  layout: CompletionLayout,
  total: number,
): CompletionGrid {
  const grid: CompletionGrid = [];
  for (let column = 0; column < layout.columns; column++) {
    const entries: number[] = [];
    for (let row = 0; row < layout.rows; row++) {
      const index = column * layout.rows + row;
      if (index >= total) break;
      entries.push(index);
    }
    if (entries.length) grid.push(entries);
  }
  return grid;
}

export function navigateCompletionIndex(
  current: number,
  direction: CompletionDirection,
  grid: CompletionGrid,
): number | null {
  if (!grid.length) return null;
  const pos = findPosition(current, grid);
  if (!pos) {
    const first = grid[0]?.[0];
    return typeof first === "number" ? first : null;
  }
  const { column, row } = pos;
  switch (direction) {
    case "up": {
      const nextRow = row === 0 ? grid[column].length - 1 : row - 1;
      if (nextRow === row) return null;
      return grid[column][nextRow] ?? null;
    }
    case "down": {
      const lastRow = grid[column].length - 1;
      const nextRow = row === lastRow ? 0 : row + 1;
      if (nextRow === row) return null;
      return grid[column][nextRow] ?? null;
    }
    case "left": {
      if (grid.length === 1) return null;
      const targetColumn = column === 0 ? grid.length - 1 : column - 1;
      return pickColumnRow(grid, targetColumn, row);
    }
    case "right": {
      if (grid.length === 1) return null;
      const targetColumn = column === grid.length - 1 ? 0 : column + 1;
      return pickColumnRow(grid, targetColumn, row);
    }
    default:
      return null;
  }
}

function findPosition(
  index: number,
  grid: CompletionGrid,
): { column: number; row: number } | null {
  if (index < 0) return null;
  for (let column = 0; column < grid.length; column++) {
    const row = grid[column].indexOf(index);
    if (row !== -1) return { column, row };
  }
  return null;
}

function pickColumnRow(
  grid: CompletionGrid,
  column: number,
  row: number,
): number | null {
  const entries = grid[column];
  if (!entries?.length) return null;
  const boundedRow = Math.min(row, entries.length - 1);
  if (boundedRow < 0) return null;
  return entries[boundedRow] ?? null;
}
