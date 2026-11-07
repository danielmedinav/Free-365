import { DetailedCellError, HyperFormula, type RawCellContent } from 'hyperformula';
import { cellKey, parseCellKey, type Cell, type Sheet, type Workbook } from './workbook';

const OPTIONS = { licenseKey: 'gpl-v3', dateFormats: ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD.MM.YYYY'] };

/** HyperFormula only knows TRUE() and FALSE() as functions, but people write them as plain words. */
const CONSTANTS = [
  { name: 'TRUE', expression: '=TRUE()' },
  { name: 'FALSE', expression: '=FALSE()' },
];

function buildEngine(workbook: Workbook): HyperFormula {
  return HyperFormula.buildFromSheets(toEngineSheets(workbook), OPTIONS, CONSTANTS);
}

export type CellResult = {
  value: number | string | boolean | null;
  isError: boolean;
  isDate: boolean;
};

const EMPTY_RESULT: CellResult = { value: null, isError: false, isDate: false };

function toMatrix(sheet: Sheet): RawCellContent[][] {
  const matrix: RawCellContent[][] = [];
  for (const [key, cell] of Object.entries(sheet.cells)) {
    if (cell.raw === undefined || cell.raw === '') continue;
    const { row, column } = parseCellKey(key);
    (matrix[row] ??= [])[column] = cell.raw;
  }
  for (let row = 0; row < matrix.length; row++) matrix[row] ??= [];
  return matrix;
}

function toEngineSheets(workbook: Workbook) {
  return Object.fromEntries(workbook.sheets.map((sheet) => [sheet.name, toMatrix(sheet)]));
}

function sameSheetList(a: Workbook, b: Workbook): boolean {
  return (
    a.sheets.length === b.sheets.length &&
    a.sheets.every((sheet, index) => {
      const other = b.sheets[index]!;
      return sheet.id === other.id && sheet.name === other.name;
    })
  );
}

/**
 * Adapts HyperFormula to the workbook model. The workbook is the source of truth: this holds a copy
 * of its contents, kept in step by `sync`, and calculates results.
 */
export class FormulaEngine {
  private hf: HyperFormula;

  constructor(workbook: Workbook) {
    this.hf = buildEngine(workbook);
  }

  destroy() {
    this.hf.destroy();
  }

  private sheetId(sheet: Sheet): number | undefined {
    return this.hf.getSheetId(sheet.name);
  }

  result(sheet: Sheet, row: number, column: number): CellResult {
    const id = this.sheetId(sheet);
    if (id === undefined) return EMPTY_RESULT;
    const address = { sheet: id, row, col: column };
    const value = this.hf.getCellValue(address);
    if (value instanceof DetailedCellError) {
      return { value: value.value, isError: true, isDate: false };
    }
    const type = this.hf.getCellValueDetailedType(address);
    return { value, isError: false, isDate: type === 'NUMBER_DATE' };
  }

  /** Brings the engine from one workbook state to another, touching only what changed. */
  sync(previous: Workbook, next: Workbook) {
    if (previous === next) return;
    if (!sameSheetList(previous, next)) {
      this.hf.destroy();
      this.hf = buildEngine(next);
      return;
    }
    this.hf.batch(() => {
      next.sheets.forEach((sheet, index) => {
        const before = previous.sheets[index]!;
        if (before.cells === sheet.cells) return;
        const id = this.sheetId(sheet);
        if (id === undefined) return;
        for (const key of new Set([...Object.keys(before.cells), ...Object.keys(sheet.cells)])) {
          const raw = sheet.cells[key]?.raw;
          if (before.cells[key]?.raw === raw) continue;
          const { row, column } = parseCellKey(key);
          this.hf.setCellContents({ sheet: id, row, col: column }, [
            [raw === '' ? null : (raw ?? null)],
          ]);
        }
      });
    });
  }

  /**
   * Runs a change to the sheet structure, which makes HyperFormula rewrite formulas that refer to the
   * moved cells, then hands back the workbook with those rewritten formulas in place.
   */
  private rewriteFormulas(workbook: Workbook, change: () => void): Workbook {
    change();
    return {
      ...workbook,
      sheets: workbook.sheets.map((sheet) => {
        const id = this.sheetId(sheet);
        if (id === undefined) return sheet;
        let cells = sheet.cells;
        for (const [key, cell] of Object.entries(sheet.cells)) {
          if (typeof cell.raw !== 'string' || !cell.raw.startsWith('=')) continue;
          const { row, column } = parseCellKey(key);
          const raw = this.hf.getCellSerialized({ sheet: id, row, col: column });
          if (typeof raw === 'string' && raw !== cell.raw) {
            if (cells === sheet.cells) cells = { ...sheet.cells };
            cells[key] = { ...cell, raw };
          }
        }
        return cells === sheet.cells ? sheet : { ...sheet, cells };
      }),
    };
  }

  /** `moved` is the workbook with cells already moved to their new places. */
  insertRows(moved: Workbook, sheet: Sheet, row: number, count: number): Workbook {
    const id = this.sheetId(sheet)!;
    return this.rewriteFormulas(moved, () => this.hf.addRows(id, [row, count]));
  }

  removeRows(moved: Workbook, sheet: Sheet, row: number, count: number): Workbook {
    const id = this.sheetId(sheet)!;
    return this.rewriteFormulas(moved, () => this.hf.removeRows(id, [row, count]));
  }

  insertColumns(moved: Workbook, sheet: Sheet, column: number, count: number): Workbook {
    const id = this.sheetId(sheet)!;
    return this.rewriteFormulas(moved, () => this.hf.addColumns(id, [column, count]));
  }

  removeColumns(moved: Workbook, sheet: Sheet, column: number, count: number): Workbook {
    const id = this.sheetId(sheet)!;
    return this.rewriteFormulas(moved, () => this.hf.removeColumns(id, [column, count]));
  }

  renameSheet(workbook: Workbook, sheet: Sheet, name: string): Workbook {
    const id = this.sheetId(sheet)!;
    const renamed = {
      ...workbook,
      sheets: workbook.sheets.map((s) => (s.id === sheet.id ? { ...s, name } : s)),
    };
    return this.rewriteFormulas(renamed, () => this.hf.renameSheet(id, name));
  }

  removeSheet(workbook: Workbook, sheet: Sheet): Workbook {
    const id = this.sheetId(sheet)!;
    const remaining = { ...workbook, sheets: workbook.sheets.filter((s) => s.id !== sheet.id) };
    return this.rewriteFormulas(remaining, () => this.hf.removeSheet(id));
  }
}

/** Moves every cell at or past `at`; returns cells without those in the removed span. */
export function shiftCells(
  cells: Record<string, Cell>,
  axis: 'row' | 'column',
  at: number,
  delta: number,
): Record<string, Cell> {
  const moved: Record<string, Cell> = {};
  for (const [key, cell] of Object.entries(cells)) {
    const point = parseCellKey(key);
    const position = point[axis];
    if (delta < 0 && position >= at && position < at - delta) continue;
    const shifted = position >= at ? position + delta : position;
    moved[axis === 'row' ? cellKey(shifted, point.column) : cellKey(point.row, shifted)] = cell;
  }
  return moved;
}
