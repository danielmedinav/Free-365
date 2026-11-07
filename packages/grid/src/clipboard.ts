import Papa from 'papaparse';
import { shiftFormula } from './formulaRefs';
import type { Cell, CellRange } from './workbook';

/** Cells as copied, kept so pasting here can bring formulas and formatting along. */
export type CopiedCells = {
  text: string;
  range: CellRange;
  /** Rows of cells, relative to the top left of the range. */
  cells: (Cell | undefined)[][];
};

export type CellReplacement = { row: number; column: number; cell?: Cell };

/** Tab-separated text, which other spreadsheet programs paste as cells. */
export function toClipboardText(rows: string[][]): string {
  return Papa.unparse(rows, { delimiter: '\t', newline: '\r\n' });
}

export function parseClipboardText(text: string): string[][] {
  const { data } = Papa.parse<string[]>(text.replace(/\r?\n$/, ''), { delimiter: '\t' });
  return data;
}

function moved(cell: Cell | undefined, rows: number, columns: number): Cell | undefined {
  if (!cell || typeof cell.raw !== 'string') return cell;
  return { ...cell, raw: shiftFormula(cell.raw, rows, columns) };
}

/**
 * The cells to write when pasting what was copied here. Formulas adjust to where they land, and if
 * the target is a larger selection, one copied cell fills all of it.
 */
export function pasteCopied(copied: CopiedCells, target: CellRange): CellReplacement[] {
  const height = copied.cells.length;
  const width = copied.cells[0]?.length ?? 0;
  const fills = height === 1 && width === 1;
  const bottom = fills ? target.bottom : target.top + height - 1;
  const right = fills ? target.right : target.left + width - 1;

  const replacements: CellReplacement[] = [];
  for (let row = target.top; row <= bottom; row++) {
    for (let column = target.left; column <= right; column++) {
      const source = fills
        ? copied.cells[0]![0]
        : copied.cells[row - target.top]![column - target.left];
      const fromRow = fills ? copied.range.top : copied.range.top + row - target.top;
      const fromColumn = fills ? copied.range.left : copied.range.left + column - target.left;
      replacements.push({ row, column, cell: moved(source, row - fromRow, column - fromColumn) });
    }
  }
  return replacements;
}

/** The cells to write when pasting text from elsewhere. */
export function pasteText(text: string, target: CellRange): CellReplacement[] {
  return parseClipboardText(text).flatMap((values, rowOffset) =>
    values.map((value, columnOffset) => ({
      row: target.top + rowOffset,
      column: target.left + columnOffset,
      cell: value === '' ? undefined : { raw: value },
    })),
  );
}
