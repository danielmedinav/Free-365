import Papa from 'papaparse';
import { displayText } from '../display';
import type { FormulaEngine } from '../engine';
import { usedRange } from '../sortFilter';
import { cellKey, createSheet, type Sheet } from '../workbook';

/** Writes what the sheet shows, as formulas don't exist in .csv files. */
export function sheetToCsv(sheet: Sheet, engine: FormulaEngine): string {
  const range = usedRange(sheet);
  if (!range) return '';
  const rows: string[][] = [];
  for (let row = 0; row <= range.bottom; row++) {
    const values: string[] = [];
    for (let column = 0; column <= range.right; column++) {
      const format = sheet.cells[cellKey(row, column)]?.style?.format;
      values.push(displayText(engine.result(sheet, row, column), format));
    }
    rows.push(values);
  }
  return Papa.unparse(rows, { newline: '\r\n' });
}

/** Reads .csv text into a new sheet. */
export function csvToSheet(text: string, name: string): Sheet {
  const { data } = Papa.parse<string[]>(text, { skipEmptyLines: false });
  // A final line break isn't a row of its own.
  const last = data[data.length - 1];
  if (last && last.length === 1 && last[0] === '') data.pop();

  const sheet = createSheet(name);
  data.forEach((values, row) => {
    values.forEach((value, column) => {
      if (value !== '') sheet.cells[cellKey(row, column)] = { raw: value };
    });
  });
  return sheet;
}
