import ExcelJS from 'exceljs';
import { dateToSerial, serialToDate } from '../display';
import type { FormulaEngine } from '../engine';
import {
  cellKey,
  cleanSheetName,
  createSheet,
  DEFAULT_COLUMN_WIDTH,
  MAX_COLUMNS,
  MAX_ROWS,
  parseCellKey,
  type Cell,
  type CellStyle,
  type NumberFormat,
  type Sheet,
  type Workbook,
} from '../workbook';

/** A .xlsx width unit is about one character; this is close to how they render. */
const PIXELS_PER_WIDTH_UNIT = 7;

const NUMBER_FORMATS: Record<Exclude<NumberFormat, 'general'>, string> = {
  number: '#,##0.00',
  currency: '"$"#,##0.00',
  percent: '0.00%',
  date: 'yyyy-mm-dd',
};

function toArgb(color: string | undefined) {
  return color ? { argb: `FF${color.replace('#', '').toUpperCase()}` } : undefined;
}

function fromArgb(color: { argb?: string } | undefined): string | undefined {
  const argb = color?.argb;
  return argb && /^[0-9a-f]{8}$/i.test(argb) ? `#${argb.slice(2).toLowerCase()}` : undefined;
}

function writeStyle(target: ExcelJS.Cell, style: CellStyle | undefined, isDate: boolean) {
  const format = style?.format;
  if (format && format !== 'general') target.numFmt = NUMBER_FORMATS[format];
  else if (isDate) target.numFmt = NUMBER_FORMATS.date;
  if (!style) return;
  if (style.bold || style.italic || style.underline || style.color) {
    target.font = {
      bold: style.bold,
      italic: style.italic,
      underline: style.underline,
      color: toArgb(style.color),
    };
  }
  const fill = toArgb(style.fill);
  if (fill) target.fill = { type: 'pattern', pattern: 'solid', fgColor: fill };
  if (style.align) target.alignment = { horizontal: style.align };
}

function writeValue(target: ExcelJS.Cell, cell: Cell, result: ReturnType<FormulaEngine['result']>) {
  const { raw } = cell;
  if (typeof raw === 'string' && raw.startsWith('=')) {
    const { value, isError, isDate } = result;
    target.value = {
      formula: raw.slice(1),
      // Saved alongside the formula, so programs that don't recalculate still show the answer.
      result: isError
        ? { error: value as ExcelJS.CellErrorValue['error'] }
        : isDate && typeof value === 'number'
          ? serialToDate(value)
          : (value ?? undefined),
    } as ExcelJS.CellFormulaValue;
    return;
  }
  const { value, isDate } = result;
  if (isDate && typeof value === 'number') target.value = serialToDate(value);
  else target.value = value ?? (raw as ExcelJS.CellValue);
}

export type ChartImage = {
  base64: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Creates a .xlsx file. Charts go in as pictures, as the file library can't write real ones. */
export async function exportXlsx(
  workbook: Workbook,
  engine: FormulaEngine,
  chartImages: Record<string, ChartImage[]> = {},
): Promise<Blob> {
  const file = new ExcelJS.Workbook();
  file.creator = 'Free 360';

  for (const sheet of workbook.sheets) {
    const target = file.addWorksheet(sheet.name);
    for (const [key, cell] of Object.entries(sheet.cells)) {
      const { row, column } = parseCellKey(key);
      const result = engine.result(sheet, row, column);
      const excelCell = target.getCell(row + 1, column + 1);
      if (cell.raw !== undefined && cell.raw !== '') writeValue(excelCell, cell, result);
      writeStyle(excelCell, cell.style, result.isDate);
    }
    for (const [key, width] of Object.entries(sheet.columnWidths)) {
      target.getColumn(Number(key) + 1).width = width / PIXELS_PER_WIDTH_UNIT;
    }
    for (const image of chartImages[sheet.id] ?? []) {
      const id = file.addImage({ base64: image.base64, extension: 'png' });
      target.addImage(id, {
        tl: { col: image.x / DEFAULT_COLUMN_WIDTH, row: image.y / 24 },
        ext: { width: image.width, height: image.height },
      });
    }
  }

  const buffer = await file.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function readStyle(cell: ExcelJS.Cell): CellStyle | undefined {
  const style: CellStyle = {};
  const { font, fill, alignment, numFmt } = cell;
  if (font?.bold) style.bold = true;
  if (font?.italic) style.italic = true;
  if (font?.underline) style.underline = true;
  const color = fromArgb(font?.color);
  if (color) style.color = color;
  if (fill?.type === 'pattern' && fill.pattern === 'solid') {
    const background = fromArgb(fill.fgColor);
    if (background) style.fill = background;
  }
  const { horizontal } = alignment ?? {};
  if (horizontal === 'left' || horizontal === 'center' || horizontal === 'right') {
    style.align = horizontal;
  }
  if (numFmt) {
    if (numFmt.includes('%')) style.format = 'percent';
    else if (/[$€£¥]/.test(numFmt)) style.format = 'currency';
    else if (/[ymd]/i.test(numFmt.replace(/\[[^\]]*\]|"[^"]*"/g, ''))) style.format = 'date';
    else if (/0\.0|#,##0/.test(numFmt)) style.format = 'number';
  }
  return Object.keys(style).length ? style : undefined;
}

function isFormula(value: ExcelJS.CellValue): value is ExcelJS.CellFormulaValue {
  return typeof value === 'object' && value !== null && 'formula' in value && !!value.formula;
}

function readRaw(cell: ExcelJS.Cell): Cell['raw'] {
  const { value } = cell;
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    // Stored as a serial number that displays as a date, once the cell has that format.
    return dateToSerial(new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (isFormula(value)) return `=${value.formula}`;
  if ('sharedFormula' in value) return undefined;
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('hyperlink' in value) return String(value.text ?? value.hyperlink);
  if ('error' in value) return value.error;
  return undefined;
}

/** Excel writes runs of the same formula once; `cell.formula` gives each cell its own version. */
function readCellRaw(cell: ExcelJS.Cell): Cell['raw'] {
  const { value } = cell;
  if (typeof value === 'object' && value !== null && 'sharedFormula' in value) {
    return cell.formula ? `=${cell.formula}` : undefined;
  }
  return readRaw(cell);
}

function readSheet(source: ExcelJS.Worksheet, name: string): Sheet {
  const sheet = createSheet(name);
  source.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > MAX_ROWS) return;
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      if (columnNumber > MAX_COLUMNS) return;
      const raw = readCellRaw(cell);
      const style = readStyle(cell);
      const isDateValue = cell.value instanceof Date;
      const target: Cell = {};
      if (raw !== undefined) target.raw = raw;
      if (style || isDateValue) {
        target.style = { ...style, ...(isDateValue ? { format: 'date' as const } : {}) };
      }
      if (target.raw !== undefined || target.style) {
        sheet.cells[cellKey(rowNumber - 1, columnNumber - 1)] = target;
      }
    });
  });
  source.columns?.forEach((column, index) => {
    if (column.width && index < MAX_COLUMNS && column.isCustomWidth) {
      sheet.columnWidths[index] = Math.round(column.width * PIXELS_PER_WIDTH_UNIT);
    }
  });
  return sheet;
}

/** Reads a .xlsx file. Charts and pictures are left out. */
export async function importXlsx(file: ArrayBuffer): Promise<Workbook> {
  const source = new ExcelJS.Workbook();
  await source.xlsx.load(file);
  const used = new Set<string>();
  const sheets = source.worksheets.map((worksheet, index) => {
    let name = cleanSheetName(worksheet.name) || `Sheet${index + 1}`;
    while (used.has(name.toLowerCase())) name = `${name.slice(0, 28)} ${index + 1}`;
    used.add(name.toLowerCase());
    return readSheet(worksheet, name);
  });
  if (!sheets.length) throw new Error('This file has no worksheets');
  return { sheets, activeSheetId: sheets[0]!.id };
}
