import type { DocContent } from '@free360/core';

export const GRID_SCHEMA_VERSION = 1;

export const MAX_ROWS = 10_000;
export const MAX_COLUMNS = 100;
export const DEFAULT_COLUMN_WIDTH = 96;
export const ROW_HEIGHT = 24;

export type RawValue = string | number | boolean;

export type NumberFormat = 'general' | 'number' | 'currency' | 'percent' | 'date';

export type CellStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fill?: string;
  align?: 'left' | 'center' | 'right';
  format?: NumberFormat;
};

export type Cell = {
  /** What was entered: a value, or a formula starting with `=`. */
  raw?: RawValue;
  style?: CellStyle;
};

export type ChartKind = 'bar' | 'line' | 'pie';

export type CellRange = { top: number; left: number; bottom: number; right: number };

export type ChartDefinition = {
  id: string;
  kind: ChartKind;
  range: CellRange;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SheetFilter = CellRange & {
  /** For each filtered column, the displayed values to hide. */
  hidden: Record<number, string[]>;
};

export type Sheet = {
  id: string;
  name: string;
  /** Sparse, keyed by `row:column`. */
  cells: Record<string, Cell>;
  columnWidths: Record<number, number>;
  charts: ChartDefinition[];
  filter?: SheetFilter;
};

export type Workbook = {
  sheets: Sheet[];
  activeSheetId: string;
};

export function cellKey(row: number, column: number): string {
  return `${row}:${column}`;
}

export function parseCellKey(key: string): { row: number; column: number } {
  const [row, column] = key.split(':');
  return { row: Number(row), column: Number(column) };
}

/** `0` -> `A`, `26` -> `AA`. */
export function columnName(column: number): string {
  let name = '';
  for (let n = column; n >= 0; n = Math.floor(n / 26) - 1) {
    name = String.fromCharCode(65 + (n % 26)) + name;
  }
  return name;
}

export function cellName(row: number, column: number): string {
  return `${columnName(column)}${row + 1}`;
}

export function normalizeRange(a: CellPoint, b: CellPoint): CellRange {
  return {
    top: Math.min(a.row, b.row),
    bottom: Math.max(a.row, b.row),
    left: Math.min(a.column, b.column),
    right: Math.max(a.column, b.column),
  };
}

export type CellPoint = { row: number; column: number };

export function rangeName(range: CellRange): string {
  const start = cellName(range.top, range.left);
  const end = cellName(range.bottom, range.right);
  return start === end ? start : `${start}:${end}`;
}

export function newSheetId(): string {
  return crypto.randomUUID();
}

export function createSheet(name: string): Sheet {
  return { id: newSheetId(), name, cells: {}, columnWidths: {}, charts: [] };
}

export function createWorkbook(): Workbook {
  const sheet = createSheet('Sheet1');
  return { sheets: [sheet], activeSheetId: sheet.id };
}

/** The first unused `Sheet1`, `Sheet2`, ... */
export function nextSheetName(sheets: Sheet[], base = 'Sheet'): string {
  const used = new Set(sheets.map((sheet) => sheet.name.toLowerCase()));
  for (let n = 1; ; n++) {
    const name = `${base}${n}`;
    if (!used.has(name.toLowerCase())) return name;
  }
}

/** Formula references can't handle every character, so names keep to the safe ones. */
export function cleanSheetName(name: string): string {
  return name
    .replace(/['"\\/?*[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31);
}

export function activeSheet(workbook: Workbook): Sheet {
  return (
    workbook.sheets.find((sheet) => sheet.id === workbook.activeSheetId) ?? workbook.sheets[0]!
  );
}

export class UnsupportedVersionError extends Error {
  constructor(readonly version: number) {
    super(`Spreadsheet was saved by a newer version of FreeGrid (schema ${version})`);
    this.name = 'UnsupportedVersionError';
  }
}

/** Reads a stored body. New spreadsheets are stored with null data. */
export function readWorkbook(content: DocContent<Workbook | null> | undefined): Workbook {
  if (!content) return createWorkbook();
  // Refuse rather than load: autosave would overwrite data this version doesn't understand.
  if (content.schemaVersion > GRID_SCHEMA_VERSION) {
    throw new UnsupportedVersionError(content.schemaVersion);
  }
  return content.data?.sheets?.length ? content.data : createWorkbook();
}
