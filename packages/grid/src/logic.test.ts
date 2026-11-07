import { afterEach, describe, expect, it } from 'vitest';
import { dateToSerial, defaultAlignment, displayText, summarize } from './display';
import { shiftFormula } from './formulaRefs';
import {
  columnValues,
  createFilter,
  currentRegion,
  hiddenRows,
  looksLikeHeader,
  sortedRows,
  usedRange,
} from './sortFilter';
import { GridStore } from './store';
import { activeSheet, cellKey, cellName, columnName, createWorkbook, rangeName } from './workbook';

const stores: GridStore[] = [];
afterEach(() => stores.splice(0).forEach((store) => store.destroy()));

/** A store whose active sheet holds these rows, starting at A1. */
function withRows(rows: (string | number)[][]) {
  const store = new GridStore(createWorkbook());
  stores.push(store);
  store.setCells(
    'fill',
    rows.flatMap((values, row) => values.map((raw, column) => ({ row, column, raw }))),
  );
  return store;
}

const sheetOf = (store: GridStore) => activeSheet(store.getWorkbook());
const result = (value: number | string | boolean | null, isDate = false) => ({
  value,
  isDate,
  isError: false,
});

describe('names', () => {
  it('names columns the usual way', () => {
    expect(columnName(0)).toBe('A');
    expect(columnName(25)).toBe('Z');
    expect(columnName(26)).toBe('AA');
    expect(columnName(701)).toBe('ZZ');
    expect(columnName(702)).toBe('AAA');
    expect(cellName(0, 1)).toBe('B1');
    expect(rangeName({ top: 0, left: 0, bottom: 2, right: 1 })).toBe('A1:B3');
    expect(rangeName({ top: 4, left: 2, bottom: 4, right: 2 })).toBe('C5');
  });
});

describe('displayText', () => {
  it('shows each kind of value', () => {
    expect(displayText(result(null))).toBe('');
    expect(displayText(result('hi'))).toBe('hi');
    expect(displayText(result(true))).toBe('TRUE');
    expect(displayText(result(12.5))).toBe('12.5');
  });

  it('hides floating point noise', () => {
    expect(displayText(result(0.1 + 0.2))).toBe('0.3');
  });

  it('applies number formats', () => {
    expect(displayText(result(1234.5), 'number')).toBe('1,234.50');
    expect(displayText(result(1234.5), 'currency')).toBe('$1,234.50');
    expect(displayText(result(0.125), 'percent')).toBe('12.50%');
    expect(displayText(result('text'), 'currency')).toBe('text');
  });

  it('shows dates, whether typed as dates or formatted as them', () => {
    const serial = dateToSerial(new Date(2026, 2, 15));
    expect(displayText(result(serial, true))).toBe('2026-03-15');
    expect(displayText(result(serial), 'date')).toBe('2026-03-15');
  });

  it('aligns numbers right, text left, and errors center', () => {
    expect(defaultAlignment(result(1))).toBe('right');
    expect(defaultAlignment(result('a'))).toBe('left');
    expect(defaultAlignment({ value: '#REF!', isError: true, isDate: false })).toBe('center');
  });

  it('summarizes a selection', () => {
    const stats = summarize([
      result(2),
      result(4),
      result('x'),
      result(null),
      { value: '#REF!', isError: true, isDate: false },
    ]);
    expect(stats).toEqual({ count: 4, numbers: 2, sum: 6, average: 3 });
  });
});

describe('shiftFormula', () => {
  it('moves plain references', () => {
    expect(shiftFormula('=A1+B2', 1, 2)).toBe('=C2+D3');
    expect(shiftFormula('=SUM(A1:A3)', 2, 0)).toBe('=SUM(A3:A5)');
  });

  it('keeps references marked with $', () => {
    expect(shiftFormula('=$A$1+A$1+$A1', 1, 1)).toBe('=$A$1+B$1+$A2');
  });

  it('leaves text in quotes, and function names, alone', () => {
    expect(shiftFormula('="A1"&A1', 1, 0)).toBe('="A1"&A2');
    expect(shiftFormula('=LOG10(A1)', 1, 0)).toBe('=LOG10(A2)');
  });

  it('shifts references to other sheets, but not their names', () => {
    expect(shiftFormula('=Sheet1!A1', 1, 0)).toBe('=Sheet1!A2');
    expect(shiftFormula("='My A1 data'!B2", 1, 0)).toBe("='My A1 data'!B3");
  });

  it('marks references pushed off the sheet', () => {
    expect(shiftFormula('=A1', -1, 0)).toBe('=#REF!');
    expect(shiftFormula('=A1', 0, -1)).toBe('=#REF!');
  });

  it('leaves anything that is not a formula alone', () => {
    expect(shiftFormula('A1', 1, 1)).toBe('A1');
  });
});

describe('regions', () => {
  it('finds the block around a cell, stopping at empty rows and columns', () => {
    const store = withRows([
      ['a', 'b', '', 'x'],
      [1, 2, '', 'y'],
      ['', '', '', ''],
      ['z', '', '', ''],
    ]);
    expect(currentRegion(sheetOf(store), 1, 0)).toEqual({ top: 0, left: 0, bottom: 1, right: 1 });
  });

  it('finds what is used', () => {
    const store = withRows([
      ['', 'b'],
      ['c', ''],
    ]);
    expect(usedRange(sheetOf(store))).toEqual({ top: 0, left: 0, bottom: 1, right: 1 });
    expect(usedRange(sheetOf(withRows([])))).toBeUndefined();
  });

  it('recognizes a heading row', () => {
    const headed = withRows([
      ['Name', 'Age'],
      ['Ann', 30],
    ]);
    const range = { top: 0, left: 0, bottom: 1, right: 1 };
    expect(looksLikeHeader(sheetOf(headed), range, headed.engine)).toBe(true);
    const names = withRows([
      ['Ann', 'Bob'],
      ['Cid', 'Dee'],
    ]);
    expect(looksLikeHeader(sheetOf(names), range, names.engine)).toBe(false);
    const numbers = withRows([
      [1, 2],
      [3, 4],
    ]);
    expect(looksLikeHeader(sheetOf(numbers), range, numbers.engine)).toBe(false);
  });
});

describe('sorting', () => {
  const column = (store: GridStore, index: number, rows: number) =>
    Array.from({ length: rows }, (_, row) => store.engine.result(sheetOf(store), row, index).value);

  function sort(store: GridStore, rows: number, by: number, direction: 1 | -1) {
    const range = { top: 0, left: 0, bottom: rows - 1, right: 1 };
    store.replaceCells('Sort', sortedRows(sheetOf(store), store.engine, range, by, direction));
  }

  it('sorts numbers and text, either way, keeping rows together', () => {
    const store = withRows([
      [3, 'c'],
      [1, 'a'],
      [2, 'b'],
    ]);
    sort(store, 3, 0, 1);
    expect(column(store, 0, 3)).toEqual([1, 2, 3]);
    expect(column(store, 1, 3)).toEqual(['a', 'b', 'c']);
    sort(store, 3, 1, -1);
    expect(column(store, 0, 3)).toEqual([3, 2, 1]);
  });

  it('puts empty cells last in both directions', () => {
    const store = withRows([
      ['', 'x'],
      [2, 'y'],
      [1, 'z'],
    ]);
    sort(store, 3, 0, 1);
    expect(column(store, 0, 3)).toEqual([1, 2, null]);
    sort(store, 3, 0, -1);
    expect(column(store, 0, 3)).toEqual([2, 1, null]);
  });

  it('sorts numbers before text, naturally, ignoring case', () => {
    const store = withRows([['b'], ['A'], [2], ['item 10'], ['item 2']]);
    const range = { top: 0, left: 0, bottom: 4, right: 0 };
    store.replaceCells('Sort', sortedRows(sheetOf(store), store.engine, range, 0, 1));
    expect(column(store, 0, 5)).toEqual([2, 'A', 'b', 'item 2', 'item 10']);
  });

  it('moves formulas with their rows, so they still use their own row', () => {
    const store = withRows([
      [3, '=A1*2'],
      [1, '=A2*2'],
    ]);
    sort(store, 2, 0, 1);
    expect(column(store, 1, 2)).toEqual([2, 6]);
    expect(sheetOf(store).cells[cellKey(0, 1)]?.raw).toBe('=A1*2');
  });

  it('can be undone in one step', () => {
    const store = withRows([[2], [1]]);
    store.replaceCells(
      'Sort',
      sortedRows(sheetOf(store), store.engine, { top: 0, left: 0, bottom: 1, right: 0 }, 0, 1),
    );
    store.history.undo();
    expect(column(store, 0, 2)).toEqual([2, 1]);
  });
});

describe('filtering', () => {
  const data = [
    ['Fruit', 'Qty'],
    ['apple', 1],
    ['pear', 2],
    ['apple', 3],
    ['', 4],
  ];

  it('lists the different values, with empty last', () => {
    const store = withRows(data);
    store.setFilter(createFilter({ top: 0, left: 0, bottom: 4, right: 1 }));
    expect(columnValues(sheetOf(store), store.engine, 0)).toEqual(['apple', 'pear', '']);
  });

  it('hides rows with the unchecked values, never the headings', () => {
    const store = withRows(data);
    store.setFilter({
      ...createFilter({ top: 0, left: 0, bottom: 4, right: 1 }),
      hidden: { 0: ['apple'] },
    });
    expect([...hiddenRows(sheetOf(store), store.engine)]).toEqual([1, 3]);
  });

  it('combines filters on several columns', () => {
    const store = withRows(data);
    store.setFilter({
      ...createFilter({ top: 0, left: 0, bottom: 4, right: 1 }),
      hidden: { 0: ['apple'], 1: ['2'] },
    });
    expect([...hiddenRows(sheetOf(store), store.engine)].sort()).toEqual([1, 2, 3]);
  });

  it('moves with the sheet when a row is inserted above it, and is undoable', () => {
    const store = withRows(data);
    store.setFilter(createFilter({ top: 0, left: 0, bottom: 4, right: 1 }));
    store.insertRows(0, 1);
    expect(sheetOf(store).filter).toMatchObject({ top: 1, bottom: 5 });
    store.history.undo();
    expect(sheetOf(store).filter).toMatchObject({ top: 0, bottom: 4 });
  });

  it('hides nothing without a filter', () => {
    const store = withRows(data);
    expect(hiddenRows(sheetOf(store), store.engine).size).toBe(0);
  });
});
