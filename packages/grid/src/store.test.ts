import { afterEach, describe, expect, it } from 'vitest';
import { GridStore } from './store';
import { activeSheet, cellKey, createWorkbook, readWorkbook } from './workbook';

const stores: GridStore[] = [];

function create() {
  const store = new GridStore(createWorkbook());
  stores.push(store);
  return store;
}

afterEach(() => {
  stores.splice(0).forEach((store) => store.destroy());
});

const sheetOf = (store: GridStore) => activeSheet(store.getWorkbook());
const value = (store: GridStore, row: number, column: number) =>
  store.engine.result(sheetOf(store), row, column).value;
const raw = (store: GridStore, row: number, column: number) =>
  sheetOf(store).cells[cellKey(row, column)]?.raw;

describe('formulas', () => {
  it('calculates formulas and follows the cells they use', () => {
    const store = create();
    store.enterValue(0, 0, '2');
    store.enterValue(1, 0, '3');
    store.enterValue(2, 0, '=SUM(A1:A2)');
    expect(value(store, 2, 0)).toBe(5);

    store.enterValue(0, 0, '10');
    expect(value(store, 2, 0)).toBe(13);
  });

  it.each([
    ['=AVERAGE(A1:A2)', 2],
    ['=IF(A1>1,"big","small")', 'small'],
    ['=VLOOKUP(1,A1:B2,2,FALSE)', 'x'],
    ['=CONCATENATE("a","b")', 'ab'],
    ['=ROUND(3.14159,2)', 3.14],
  ])('supports %s', (formula, expected) => {
    const store = create();
    store.enterValue(0, 0, '1');
    store.enterValue(1, 0, '3');
    store.enterValue(0, 1, 'x');
    store.enterValue(5, 5, formula);
    expect(value(store, 5, 5)).toBe(expected);
  });

  it('reports errors as errors', () => {
    const store = create();
    store.enterValue(0, 0, '=1/0');
    const result = store.engine.result(sheetOf(store), 0, 0);
    expect(result).toMatchObject({ isError: true, value: '#DIV/0!' });
  });

  it('recognizes dates', () => {
    const store = create();
    store.enterValue(0, 0, '2026-03-15');
    expect(store.engine.result(sheetOf(store), 0, 0).isDate).toBe(true);
  });

  it('refers across sheets, and follows a rename', () => {
    const store = create();
    store.enterValue(0, 0, '7');
    const first = sheetOf(store);
    store.addSheet();
    store.enterValue(0, 0, '=Sheet1!A1*2');
    expect(value(store, 0, 0)).toBe(14);

    expect(store.renameSheet(first.id, 'Data')).toBe(true);
    expect(raw(store, 0, 0)).toBe('=Data!A1*2');
    expect(value(store, 0, 0)).toBe(14);
  });
});

describe('undo', () => {
  it('undoes and redoes values, formulas, and the results that depend on them', () => {
    const store = create();
    store.enterValue(0, 0, '1');
    store.enterValue(1, 0, '=A1+1');
    store.enterValue(0, 0, '5');
    expect(value(store, 1, 0)).toBe(6);

    store.history.undo();
    expect(value(store, 1, 0)).toBe(2);
    store.history.redo();
    expect(value(store, 1, 0)).toBe(6);

    store.history.undo();
    store.history.undo();
    expect(raw(store, 1, 0)).toBeUndefined();
    expect(value(store, 1, 0)).toBeNull();
  });

  it('undoes formatting in the same history', () => {
    const store = create();
    store.enterValue(0, 0, '1');
    store.applyStyle({ top: 0, left: 0, bottom: 0, right: 0 }, { bold: true });
    expect(sheetOf(store).cells[cellKey(0, 0)]?.style?.bold).toBe(true);
    expect(store.history.undoLabel()).toBe('Format');

    store.history.undo();
    expect(sheetOf(store).cells[cellKey(0, 0)]?.style?.bold).toBeUndefined();
    expect(raw(store, 0, 0)).toBe('1');
  });

  it('undoes inserting rows, including rewritten formulas', () => {
    const store = create();
    store.enterValue(0, 0, '1');
    store.enterValue(1, 0, '=A1+1');
    store.insertRows(0, 1);
    expect(raw(store, 2, 0)).toBe('=A2+1');
    expect(value(store, 2, 0)).toBe(2);

    store.history.undo();
    expect(raw(store, 1, 0)).toBe('=A1+1');
    expect(raw(store, 2, 0)).toBeUndefined();
    expect(value(store, 1, 0)).toBe(2);

    store.history.redo();
    expect(raw(store, 2, 0)).toBe('=A2+1');
    expect(value(store, 2, 0)).toBe(2);
  });

  it('undoes deleting a sheet, restoring formulas that used it', () => {
    const store = create();
    const first = sheetOf(store);
    store.enterValue(0, 0, '4');
    const second = store.addSheet();
    store.enterValue(0, 0, '=Sheet1!A1');
    store.setActiveSheet(second.id);

    store.removeSheet(first.id);
    expect(store.getWorkbook().sheets).toHaveLength(1);
    expect(store.engine.result(sheetOf(store), 0, 0).isError).toBe(true);

    store.history.undo();
    expect(store.getWorkbook().sheets).toHaveLength(2);
    store.setActiveSheet(second.id);
    expect(value(store, 0, 0)).toBe(4);
  });
});

describe('rows and columns', () => {
  it('moves cells and formatting when inserting, and leaves earlier cells alone', () => {
    const store = create();
    store.setCells('x', [
      { row: 0, column: 0, raw: 'keep' },
      { row: 1, column: 0, raw: 'move', style: { bold: true } },
    ]);
    store.insertRows(1, 2);
    expect(raw(store, 0, 0)).toBe('keep');
    expect(raw(store, 1, 0)).toBeUndefined();
    expect(raw(store, 3, 0)).toBe('move');
    expect(sheetOf(store).cells[cellKey(3, 0)]?.style?.bold).toBe(true);
  });

  it('turns references to deleted cells into errors, and shifts the rest', () => {
    const store = create();
    store.enterValue(0, 0, '1');
    store.enterValue(1, 0, '2');
    store.enterValue(2, 0, '=A1');
    store.enterValue(3, 0, '=A2');
    store.removeRows(0, 1);
    expect(store.engine.result(sheetOf(store), 1, 0).isError).toBe(true);
    expect(value(store, 2, 0)).toBe(2);
    expect(raw(store, 2, 0)).toBe('=A1');
  });

  it('keeps column widths with their columns', () => {
    const store = create();
    store.setColumnWidth(1, 200);
    store.insertColumns(0, 1);
    expect(sheetOf(store).columnWidths[2]).toBe(200);
    store.removeColumns(2, 1);
    expect(sheetOf(store).columnWidths[2]).toBeUndefined();
  });
});

describe('charts', () => {
  const chart = {
    id: 'c',
    kind: 'bar' as const,
    range: { top: 1, left: 1, bottom: 3, right: 2 },
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  };

  it('keep pointing at their data when rows and columns move', () => {
    const store = create();
    store.setCharts('Add', () => [chart]);
    store.insertRows(0, 2);
    expect(sheetOf(store).charts[0]?.range).toEqual({ top: 3, left: 1, bottom: 5, right: 2 });
    store.insertColumns(2, 1);
    expect(sheetOf(store).charts[0]?.range).toEqual({ top: 3, left: 1, bottom: 5, right: 3 });
    store.removeRows(4, 1);
    expect(sheetOf(store).charts[0]?.range).toEqual({ top: 3, left: 1, bottom: 4, right: 3 });
    store.history.undo();
    expect(sheetOf(store).charts[0]?.range).toEqual({ top: 3, left: 1, bottom: 5, right: 3 });
  });
});

describe('editing', () => {
  it('clears values but keeps formatting', () => {
    const store = create();
    store.setCells('x', [{ row: 0, column: 0, raw: 'a', style: { bold: true } }]);
    store.enterValue(0, 1, 'b');
    store.clearValues({ top: 0, left: 0, bottom: 0, right: 1 });
    expect(sheetOf(store).cells[cellKey(0, 0)]).toEqual({ style: { bold: true } });
    expect(sheetOf(store).cells[cellKey(0, 1)]).toBeUndefined();
    expect(value(store, 0, 0)).toBeNull();
  });
});

describe('sheets', () => {
  it('refuses duplicate or empty names, and cleans unsafe characters', () => {
    const store = create();
    const first = sheetOf(store);
    store.addSheet();
    expect(store.renameSheet(first.id, 'sheet2')).toBe(false);
    expect(store.renameSheet(first.id, '   ')).toBe(false);
    expect(store.renameSheet(first.id, "Q1/Q2's")).toBe(true);
    expect(store.getWorkbook().sheets[0]?.name).toBe('Q1 Q2 s');
  });

  it('never removes the last sheet', () => {
    const store = create();
    store.removeSheet(sheetOf(store).id);
    expect(store.getWorkbook().sheets).toHaveLength(1);
  });

  it('switching sheets is not an undo step', () => {
    const store = create();
    const first = sheetOf(store);
    store.addSheet();
    store.setActiveSheet(first.id);
    store.history.undo();
    expect(store.getWorkbook().sheets).toHaveLength(1);
  });
});

describe('readWorkbook', () => {
  const stored = (schemaVersion: number, data: ReturnType<typeof createWorkbook> | null) => ({
    id: 'a',
    kind: 'grid' as const,
    schemaVersion,
    data,
  });

  it('starts a new workbook for new documents', () => {
    expect(readWorkbook(undefined).sheets).toHaveLength(1);
    expect(readWorkbook(stored(1, null)).sheets[0]?.name).toBe('Sheet1');
  });

  it('refuses a newer version instead of overwriting it', () => {
    expect(() => readWorkbook(stored(99, createWorkbook()))).toThrow(/newer version/);
  });
});
