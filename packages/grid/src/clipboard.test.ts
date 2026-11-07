import { describe, expect, it } from 'vitest';
import { createAxis } from './axis';
import { readChartData } from './charts';
import {
  parseClipboardText,
  pasteCopied,
  pasteText,
  toClipboardText,
  type CopiedCells,
} from './clipboard';
import { GridStore } from './store';
import { activeSheet, createWorkbook } from './workbook';

const single = (row: number, column: number) => ({
  top: row,
  bottom: row,
  left: column,
  right: column,
});

describe('clipboard text', () => {
  it('survives a round trip, including tabs and line breaks in cells', () => {
    const rows = [
      ['a', 'b c'],
      ['line\nbreak', 'tab\there'],
    ];
    expect(parseClipboardText(toClipboardText(rows))).toEqual(rows);
  });

  it('ignores the line break other programs add at the end', () => {
    expect(parseClipboardText('a\tb\r\n')).toEqual([['a', 'b']]);
  });

  it('places pasted text starting at the selected cell', () => {
    expect(pasteText('1\t\r\n3\t4', single(2, 1))).toEqual([
      { row: 2, column: 1, cell: { raw: '1' } },
      { row: 2, column: 2, cell: undefined },
      { row: 3, column: 1, cell: { raw: '3' } },
      { row: 3, column: 2, cell: { raw: '4' } },
    ]);
  });
});

describe('pasteCopied', () => {
  const copied: CopiedCells = {
    text: '',
    range: { top: 0, left: 0, bottom: 0, right: 1 },
    cells: [[{ raw: '=B1*2', style: { bold: true } }, undefined]],
  };

  it('adjusts formulas to where they land, keeping formatting', () => {
    expect(pasteCopied(copied, single(3, 2))).toEqual([
      { row: 3, column: 2, cell: { raw: '=D4*2', style: { bold: true } } },
      { row: 3, column: 3, cell: undefined },
    ]);
  });

  it('fills a larger selection from one copied cell', () => {
    const one: CopiedCells = {
      text: '',
      range: single(0, 0),
      cells: [[{ raw: '=B1' }]],
    };
    const result = pasteCopied(one, { top: 1, left: 0, bottom: 2, right: 0 });
    expect(result.map((r) => r.cell?.raw)).toEqual(['=B2', '=B3']);
  });

  it('pastes a block at its normal size, whatever the selection', () => {
    const result = pasteCopied(copied, { top: 0, left: 0, bottom: 9, right: 9 });
    expect(result).toHaveLength(2);
  });
});

describe('createAxis', () => {
  const axis = createAxis(4, (i) => (i === 2 ? 0 : 10));

  it('adds up sizes', () => {
    expect(axis.total).toBe(30);
    expect(axis.start(3)).toBe(20);
    expect(axis.size(2)).toBe(0);
  });

  it('finds what is at an offset, skipping hidden entries', () => {
    expect(axis.indexAt(0)).toBe(0);
    expect(axis.indexAt(15)).toBe(1);
    expect(axis.indexAt(20)).toBe(3);
    expect(axis.indexAt(1000)).toBe(3);
  });
});

describe('readChartData', () => {
  function dataFor(rows: (string | number)[][], hidden?: Set<number>) {
    const store = new GridStore(createWorkbook());
    store.setCells(
      'fill',
      rows.flatMap((values, row) => values.map((raw, column) => ({ row, column, raw }))),
    );
    const range = { top: 0, left: 0, bottom: rows.length - 1, right: rows[0]!.length - 1 };
    const data = readChartData(activeSheet(store.getWorkbook()), store.engine, range, hidden);
    store.destroy();
    return data;
  }

  it('reads labels from the first column and names from the first row', () => {
    expect(
      dataFor([
        ['Month', 'Sales', 'Costs'],
        ['Jan', 10, 7],
        ['Feb', 20, 9],
      ]),
    ).toEqual({
      labels: ['Jan', 'Feb'],
      series: [
        { name: 'Sales', values: [10, 20] },
        { name: 'Costs', values: [7, 9] },
      ],
    });
  });

  it('numbers the points and series when there is only data', () => {
    expect(
      dataFor([
        [1, 2],
        [3, 4],
      ]),
    ).toEqual({
      labels: ['1', '2'],
      series: [
        { name: 'Series 1', values: [1, 3] },
        { name: 'Series 2', values: [2, 4] },
      ],
    });
  });

  it('leaves gaps for cells that are not numbers, and uses formula results', () => {
    const { series } = dataFor([
      ['Item', 'Value'],
      ['a', 'n/a'],
      ['b', '=2*3'],
    ]);
    expect(series[0]?.values).toEqual([null, 6]);
  });

  it('leaves out rows a filter hides', () => {
    const { labels, series } = dataFor(
      [
        ['Item', 'Value'],
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ],
      new Set([2]),
    );
    expect(labels).toEqual(['a', 'c']);
    expect(series[0]?.values).toEqual([1, 3]);
  });
});
