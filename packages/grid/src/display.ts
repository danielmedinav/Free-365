import type { CellResult } from './engine';
import type { NumberFormat } from './workbook';

const DAY_MS = 86_400_000;
/** Spreadsheet dates count days from 1899-12-30. */
const EPOCH_UTC = Date.UTC(1899, 11, 30);

export function serialToDate(serial: number): Date {
  return new Date(EPOCH_UTC + serial * DAY_MS);
}

export function dateToSerial(date: Date): number {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((utc - EPOCH_UTC) / DAY_MS);
}

function formatDate(serial: number): string {
  const date = serialToDate(serial);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function formatGeneralNumber(value: number): string {
  // Hides floating point noise, so 0.1 + 0.2 shows as 0.3.
  return String(Number(value.toPrecision(12)));
}

const NUMBER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const CURRENCY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const PERCENT = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** The text a cell shows. */
export function displayText(result: CellResult, format: NumberFormat = 'general'): string {
  const { value, isDate } = result;
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'string') return value;
  switch (format) {
    case 'number':
      return NUMBER.format(value);
    case 'currency':
      return CURRENCY.format(value);
    case 'percent':
      return PERCENT.format(value);
    case 'date':
      return formatDate(value);
    default:
      return isDate ? formatDate(value) : formatGeneralNumber(value);
  }
}

/** Numbers line up on the right, everything else on the left, unless a cell says otherwise. */
export function defaultAlignment(result: CellResult): 'left' | 'center' | 'right' {
  if (result.isError || typeof result.value === 'boolean') return 'center';
  return typeof result.value === 'number' ? 'right' : 'left';
}

export type SelectionStats = { count: number; numbers: number; sum: number; average: number };

export function summarize(results: CellResult[]): SelectionStats {
  let count = 0;
  let numbers = 0;
  let sum = 0;
  for (const { value, isError } of results) {
    if (value === null) continue;
    count++;
    if (typeof value === 'number' && !isError) {
      numbers++;
      sum += value;
    }
  }
  return { count, numbers, sum, average: numbers ? sum / numbers : 0 };
}
