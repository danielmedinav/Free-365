import ExcelJS from 'exceljs';
import { afterEach, describe, expect, it } from 'vitest';
import { displayText } from '../display';
import { GridStore } from '../store';
import { activeSheet, cellKey, createSheet, createWorkbook, type Workbook } from '../workbook';
import { csvToSheet, sheetToCsv } from './csv';
import { exportXlsx, importXlsx } from './xlsx';

const stores: GridStore[] = [];
afterEach(() => stores.splice(0).forEach((store) => store.destroy()));

function track(workbook: Workbook) {
  const store = new GridStore(workbook);
  stores.push(store);
  return store;
}

function withRows(rows: (string | number)[][]) {
  const store = track(createWorkbook());
  store.setCells(
    'fill',
    rows.flatMap((values, row) => values.map((raw, column) => ({ row, column, raw }))),
  );
  return store;
}

async function roundTrip(store: GridStore): Promise<GridStore> {
  const blob = await exportXlsx(store.getWorkbook(), store.engine);
  return track(await importXlsx(await blob.arrayBuffer()));
}

const shown = (store: GridStore, row: number, column: number) => {
  const sheet = activeSheet(store.getWorkbook());
  const format = sheet.cells[cellKey(row, column)]?.style?.format;
  return displayText(store.engine.result(sheet, row, column), format);
};

describe('.csv', () => {
  it('writes what cells show, quoting where needed', () => {
    const store = withRows([
      ['a,b', 2],
      ['say "hi"', '=B1*2'],
    ]);
    expect(sheetToCsv(activeSheet(store.getWorkbook()), store.engine)).toBe(
      '"a,b",2\r\n"say ""hi""",4',
    );
  });

  it('applies number formats on the way out', () => {
    const store = withRows([[1234.5]]);
    store.applyStyle({ top: 0, left: 0, bottom: 0, right: 0 }, { format: 'currency' });
    expect(sheetToCsv(activeSheet(store.getWorkbook()), store.engine)).toBe('"$1,234.50"');
  });

  it('keeps gaps in place, and writes nothing for an empty sheet', () => {
    const store = withRows([['a', '', 'c'], ['', '', ''], ['x']]);
    expect(sheetToCsv(activeSheet(store.getWorkbook()), store.engine)).toBe('a,,c\r\n,,\r\nx,,');
    expect(
      sheetToCsv(activeSheet(withRows([]).getWorkbook()), track(createWorkbook()).engine),
    ).toBe('');
  });

  it('reads rows, quotes, and values the formula engine understands', () => {
    const sheet = csvToSheet('name,qty\n"a,b",3\n\nlast,=1+1\n', 'Data');
    expect(sheet.name).toBe('Data');
    expect(sheet.cells[cellKey(1, 0)]?.raw).toBe('a,b');
    expect(sheet.cells[cellKey(2, 0)]).toBeUndefined();
    expect(sheet.cells[cellKey(3, 1)]?.raw).toBe('=1+1');
    expect(Object.keys(sheet.cells)).toHaveLength(6);
  });

  it('survives a round trip', () => {
    const store = withRows([
      ['a b', 1],
      ['c,d', 2.5],
    ]);
    const text = sheetToCsv(activeSheet(store.getWorkbook()), store.engine);
    const back = csvToSheet(text, 'x');
    expect(back.cells[cellKey(1, 0)]?.raw).toBe('c,d');
    expect(back.cells[cellKey(1, 1)]?.raw).toBe('2.5');
  });
});

describe('.xlsx round trip', () => {
  it('keeps values of each kind', async () => {
    const store = withRows([['text', 12.5, '2026-03-15', 'TRUE']]);
    const back = await roundTrip(store);
    expect(shown(back, 0, 0)).toBe('text');
    expect(shown(back, 0, 1)).toBe('12.5');
    expect(shown(back, 0, 2)).toBe('2026-03-15');
    expect(shown(back, 0, 3)).toBe('TRUE');
  });

  it('keeps formulas as formulas, and their results', async () => {
    const store = withRows([[2, 3, '=SUM(A1:B1)', '=IF(C1>1,"big","small")']]);
    const back = await roundTrip(store);
    const sheet = activeSheet(back.getWorkbook());
    expect(sheet.cells[cellKey(0, 2)]?.raw).toBe('=SUM(A1:B1)');
    expect(shown(back, 0, 2)).toBe('5');
    expect(shown(back, 0, 3)).toBe('big');
  });

  it('saves results for programs that do not recalculate', async () => {
    const store = withRows([[2, '=A1*21', '=1/0']]);
    const blob = await exportXlsx(store.getWorkbook(), store.engine);
    const file = new ExcelJS.Workbook();
    await file.xlsx.load(await blob.arrayBuffer());
    const value = file.worksheets[0]!.getCell('B1').value as ExcelJS.CellFormulaValue;
    expect(value.result).toBe(42);
    const error = file.worksheets[0]!.getCell('C1').value as ExcelJS.CellFormulaValue;
    expect(error.result).toEqual({ error: '#DIV/0!' });
  });

  it('keeps formatting', async () => {
    const store = withRows([['a', 1234.5, 0.5, 45000]]);
    store.applyStyle(
      { top: 0, left: 0, bottom: 0, right: 0 },
      {
        bold: true,
        italic: true,
        underline: true,
        color: '#c62828',
        fill: '#fff176',
        align: 'center',
      },
    );
    store.applyStyle({ top: 0, left: 1, bottom: 0, right: 1 }, { format: 'currency' });
    store.applyStyle({ top: 0, left: 2, bottom: 0, right: 2 }, { format: 'percent' });
    store.applyStyle({ top: 0, left: 3, bottom: 0, right: 3 }, { format: 'date' });
    store.setColumnWidth(0, 210);

    const back = await roundTrip(store);
    const sheet = activeSheet(back.getWorkbook());
    expect(sheet.cells[cellKey(0, 0)]?.style).toEqual({
      bold: true,
      italic: true,
      underline: true,
      color: '#c62828',
      fill: '#fff176',
      align: 'center',
    });
    expect(shown(back, 0, 1)).toBe('$1,234.50');
    expect(shown(back, 0, 2)).toBe('50.00%');
    expect(shown(back, 0, 3)).toBe('2023-03-15');
    expect(sheet.columnWidths[0]).toBeCloseTo(210, -1);
  });

  it('keeps several sheets, and formulas between them', async () => {
    const workbook = createWorkbook();
    const store = track(workbook);
    store.enterValue(0, 0, '5');
    store.addSheet(createSheet('Summary'));
    store.enterValue(0, 0, '=Sheet1!A1*2');
    const back = await roundTrip(store);
    expect(back.getWorkbook().sheets.map((s) => s.name)).toEqual(['Sheet1', 'Summary']);
    back.setActiveSheet(back.getWorkbook().sheets[1]!.id);
    expect(shown(back, 0, 0)).toBe('10');
  });

  it('writes charts as pictures without disturbing the data', async () => {
    const store = withRows([['a', 1]]);
    const sheet = activeSheet(store.getWorkbook());
    const dot =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const blob = await exportXlsx(store.getWorkbook(), store.engine, {
      [sheet.id]: [{ base64: dot, x: 0, y: 0, width: 100, height: 80 }],
    });
    const file = new ExcelJS.Workbook();
    await file.xlsx.load(await blob.arrayBuffer());
    expect(file.worksheets[0]!.getImages()).toHaveLength(1);
    expect(file.worksheets[0]!.getCell('B1').value).toBe(1);
  });
});

describe('importXlsx', () => {
  async function fromExcel(build: (sheet: ExcelJS.Worksheet) => void, name = 'Data') {
    const file = new ExcelJS.Workbook();
    build(file.addWorksheet(name));
    const buffer = (await file.xlsx.writeBuffer()) as ArrayBuffer;
    return track(await importXlsx(buffer));
  }

  it('reads rich text, links, and real dates', async () => {
    const store = await fromExcel((sheet) => {
      sheet.getCell('A1').value = { richText: [{ text: 'Hello ' }, { text: 'there' }] };
      sheet.getCell('B1').value = { text: 'Site', hyperlink: 'https://example.com' };
      sheet.getCell('C1').value = new Date(Date.UTC(2026, 2, 15));
    });
    expect(shown(store, 0, 0)).toBe('Hello there');
    expect(shown(store, 0, 1)).toBe('Site');
    expect(shown(store, 0, 2)).toBe('2026-03-15');
  });

  it('cleans sheet names that would break formulas', async () => {
    const store = await fromExcel(() => {}, "Bob's data");
    expect(store.getWorkbook().sheets[0]?.name).toBe('Bob s data');
  });

  it('rejects files that are not spreadsheets', async () => {
    const buffer = new TextEncoder().encode('not a spreadsheet').buffer as ArrayBuffer;
    await expect(importXlsx(buffer)).rejects.toThrow();
  });
});
