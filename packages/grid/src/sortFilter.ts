import { displayText } from './display';
import type { FormulaEngine } from './engine';
import { shiftFormula } from './formulaRefs';
import {
  cellKey,
  parseCellKey,
  type Cell,
  type CellRange,
  type Sheet,
  type SheetFilter,
} from './workbook';

function isEmpty(sheet: Sheet, row: number, column: number): boolean {
  const raw = sheet.cells[cellKey(row, column)]?.raw;
  return raw === undefined || raw === '';
}

/** The block of filled cells around a cell, bounded by empty rows and columns. */
export function currentRegion(sheet: Sheet, row: number, column: number): CellRange {
  const range: CellRange = { top: row, bottom: row, left: column, right: column };
  const rowHasData = (r: number) => {
    for (let c = range.left; c <= range.right; c++) if (!isEmpty(sheet, r, c)) return true;
    return false;
  };
  const columnHasData = (c: number) => {
    for (let r = range.top; r <= range.bottom; r++) if (!isEmpty(sheet, r, c)) return true;
    return false;
  };
  for (let grew = true; grew;) {
    grew = false;
    if (range.top > 0 && rowHasData(range.top - 1)) {
      range.top--;
      grew = true;
    }
    if (rowHasData(range.bottom + 1)) {
      range.bottom++;
      grew = true;
    }
    if (range.left > 0 && columnHasData(range.left - 1)) {
      range.left--;
      grew = true;
    }
    if (columnHasData(range.right + 1)) {
      range.right++;
      grew = true;
    }
  }
  return range;
}

/**
 * Guesses whether a block's first row is headings: it's all text, while the row below it has a number
 * somewhere or the first row is bold.
 */
export function looksLikeHeader(sheet: Sheet, range: CellRange, engine: FormulaEngine): boolean {
  if (range.bottom <= range.top) return false;
  let allText = true;
  let bold = false;
  let numberBelow = false;
  for (let column = range.left; column <= range.right; column++) {
    const first = engine.result(sheet, range.top, column).value;
    if (first !== null && typeof first !== 'string') allText = false;
    if (sheet.cells[cellKey(range.top, column)]?.style?.bold) bold = true;
    if (typeof engine.result(sheet, range.top + 1, column).value === 'number') numberBelow = true;
  }
  return allText && (bold || numberBelow);
}

type Comparable = number | string | boolean | null;

/** Numbers, then text, then true/false; empty cells always go last, whichever the direction. */
function compareValues(a: Comparable, b: Comparable, direction: 1 | -1): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  const rank = (value: Comparable) =>
    typeof value === 'number' ? 0 : typeof value === 'string' ? 1 : 2;
  if (rank(a) !== rank(b)) return (rank(a) - rank(b)) * direction;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * direction;
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }) * direction;
  }
  return (Number(a) - Number(b)) * direction;
}

/** New contents for a block's rows, sorted by one column. Formulas move with their rows. */
export function sortedRows(
  sheet: Sheet,
  engine: FormulaEngine,
  range: CellRange,
  byColumn: number,
  direction: 1 | -1,
): { row: number; column: number; cell?: Cell }[] {
  const rows: number[] = [];
  for (let row = range.top; row <= range.bottom; row++) rows.push(row);
  const keyed = rows.map((row) => ({ row, key: engine.result(sheet, row, byColumn).value }));
  keyed.sort((a, b) => compareValues(a.key, b.key, direction) || a.row - b.row);

  const replacements: { row: number; column: number; cell?: Cell }[] = [];
  keyed.forEach(({ row: from }, index) => {
    const to = range.top + index;
    for (let column = range.left; column <= range.right; column++) {
      const cell = sheet.cells[cellKey(from, column)];
      if (cell && typeof cell.raw === 'string' && cell.raw.startsWith('=')) {
        replacements.push({
          row: to,
          column,
          cell: { ...cell, raw: shiftFormula(cell.raw, to - from, 0) },
        });
      } else {
        replacements.push({ row: to, column, cell });
      }
    }
  });
  return replacements;
}

function cellText(sheet: Sheet, engine: FormulaEngine, row: number, column: number): string {
  const format = sheet.cells[cellKey(row, column)]?.style?.format;
  return displayText(engine.result(sheet, row, column), format);
}

/** Rows a filter hides. The filter's first row is its headings, and always shows. */
export function hiddenRows(sheet: Sheet, engine: FormulaEngine): Set<number> {
  const hidden = new Set<number>();
  const { filter } = sheet;
  if (!filter) return hidden;
  for (const [key, values] of Object.entries(filter.hidden)) {
    if (!values.length) continue;
    const column = Number(key);
    const set = new Set(values);
    for (let row = filter.top + 1; row <= filter.bottom; row++) {
      if (set.has(cellText(sheet, engine, row, column))) hidden.add(row);
    }
  }
  return hidden;
}

/** The different values in a filtered column, sorted, for the checklist. */
export function columnValues(sheet: Sheet, engine: FormulaEngine, column: number): string[] {
  const { filter } = sheet;
  if (!filter) return [];
  const values = new Set<string>();
  for (let row = filter.top + 1; row <= filter.bottom; row++) {
    values.add(cellText(sheet, engine, row, column));
  }
  return [...values].sort((a, b) => {
    if (a === '' || b === '') return a === b ? 0 : a === '' ? 1 : -1;
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

export function createFilter(range: CellRange): SheetFilter {
  return { ...range, hidden: {} };
}

/** The last row and column with anything in them. */
export function usedRange(sheet: Sheet): CellRange | undefined {
  let bottom = -1;
  let right = -1;
  for (const [key, cell] of Object.entries(sheet.cells)) {
    if (cell.raw === undefined || cell.raw === '') continue;
    const { row, column } = parseCellKey(key);
    bottom = Math.max(bottom, row);
    right = Math.max(right, column);
  }
  return bottom < 0 ? undefined : { top: 0, left: 0, bottom, right };
}
