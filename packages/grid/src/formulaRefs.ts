import { columnName } from './workbook';

const REFERENCE =
  /("(?:[^"]|"")*"|'(?:[^']|'')*'!?)|(\$?)\b([A-Z]{1,3})(\$?)([1-9][0-9]{0,6})\b(?![A-Za-z0-9_(.])/g;

function columnIndex(name: string): number {
  let index = 0;
  for (const letter of name) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

/**
 * Rewrites a formula as if it had moved by this many rows and columns, the way pasting does: plain
 * references move with it, those marked with `$` stay put. A reference pushed off the sheet becomes
 * `#REF!`. Text in quotes is left alone.
 */
export function shiftFormula(formula: string, rows: number, columns: number): string {
  if (!formula.startsWith('=')) return formula;
  return formula.replace(
    REFERENCE,
    (
      match,
      quoted: string | undefined,
      fixedColumn: string,
      column: string,
      fixedRow: string,
      row: string,
    ) => {
      if (quoted) return match;
      const newColumn = columnIndex(column) + (fixedColumn ? 0 : columns);
      const newRow = Number(row) + (fixedRow ? 0 : rows);
      if (newColumn < 0 || newRow < 1) return '#REF!';
      return `${fixedColumn}${columnName(newColumn)}${fixedRow}${newRow}`;
    },
  );
}
