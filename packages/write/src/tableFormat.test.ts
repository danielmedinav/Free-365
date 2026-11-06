import { Editor } from '@tiptap/core';
import { CellSelection } from '@tiptap/pm/tables';
import { afterEach, describe, expect, it } from 'vitest';
import { writeExtensions } from './extensions';
import { readImageLayout } from './imageExtension';
import { tableColumnWidths } from './tableFormat';

const cell = (colwidth: (number | null)[] | null = null, colspan = 1) => ({ colspan, colwidth });

describe('tableColumnWidths', () => {
  it('shares the width equally when nothing was resized', () => {
    expect(tableColumnWidths([cell(), cell(), cell()], 9000)).toEqual([3000, 3000, 3000]);
  });

  it('keeps resized columns, and shares what is left between the others', () => {
    expect(tableColumnWidths([cell([100]), cell(), cell()], 9000)).toEqual([1500, 3750, 3750]);
  });

  it('scales a table down to fit between the margins', () => {
    expect(tableColumnWidths([cell([1000]), cell([1000])], 9000)).toEqual([4500, 4500]);
  });

  it('counts merged cells as several columns', () => {
    expect(tableColumnWidths([cell([100, 200], 2), cell()], 9000)).toEqual([1500, 3000, 4500]);
    expect(tableColumnWidths([cell(null, 2), cell()], 9000)).toEqual([3000, 3000, 3000]);
  });

  it('leaves columns some width even if the fixed ones use everything', () => {
    const widths = tableColumnWidths([cell([1000]), cell()], 9000);
    expect(widths[1]).toBeGreaterThan(0);
    expect(widths[0]! + widths[1]!).toBeLessThanOrEqual(9000);
  });
});

describe('readImageLayout', () => {
  it('accepts known layouts and defaults anything else to left', () => {
    expect(readImageLayout('wrap-right')).toBe('wrap-right');
    expect(readImageLayout('sideways')).toBe('left');
    expect(readImageLayout(undefined)).toBe('left');
  });
});

describe('document schema', () => {
  let editor: Editor | undefined;
  afterEach(() => editor?.destroy());

  const create = (content: string) => {
    editor = new Editor({ extensions: writeExtensions, content });
    return editor;
  };

  it('keeps an image size and layout through HTML', () => {
    const e = create('<img src="data:image/png;base64,AA" width="200" data-layout="wrap-left">');
    expect(e.state.doc.firstChild?.attrs).toMatchObject({ width: 200, layout: 'wrap-left' });
    expect(e.getHTML()).toContain('width="200"');
    expect(e.getHTML()).toContain('data-layout="wrap-left"');
  });

  it('keeps a cell color through HTML', () => {
    const e = create(
      '<table><tbody><tr><td style="background-color: #fff176"><p>a</p></td></tr></tbody></table>',
    );
    expect(e.getHTML()).toMatch(/background-color: (#fff176|rgb\(255, 241, 118\))/);
  });

  it('colors every selected cell, even if the first one already has that color', () => {
    const e = create(
      '<table><tbody><tr><td style="background-color: #fff176"><p>a</p></td></tr><tr><td><p>b</p></td></tr></tbody></table>',
    );
    const table = e.state.doc.firstChild!;
    const secondCell = 1 + table.firstChild!.nodeSize + 1;
    e.view.dispatch(e.state.tr.setSelection(CellSelection.create(e.state.doc, 2, secondCell)));

    expect(e.commands.setCellColor('#90caf9')).toBe(true);
    expect(e.getHTML().match(/background-color/g)).toHaveLength(2);

    e.view.dispatch(e.state.tr.setSelection(CellSelection.create(e.state.doc, 2, secondCell)));
    expect(e.commands.setCellColor(null)).toBe(true);
    expect(e.getHTML()).not.toContain('background-color');
  });

  it('only offers cell colors inside a table', () => {
    const e = create('<p>a</p>');
    expect(e.can().setCellColor('#90caf9')).toBe(false);
  });

  it('merges and splits selected cells', () => {
    const e = create(
      '<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></tbody></table>',
    );
    const row = e.state.doc.firstChild!.firstChild!;
    const firstCell = 2;
    const secondCell = firstCell + row.firstChild!.nodeSize;
    e.view.dispatch(
      e.state.tr.setSelection(CellSelection.create(e.state.doc, firstCell, secondCell)),
    );
    expect(e.commands.mergeCells()).toBe(true);
    expect(e.getHTML()).toContain('colspan="2"');
    expect(e.getText()).toContain('a');
    expect(e.getText()).toContain('b');

    e.commands.setTextSelection(firstCell + 2);
    expect(e.commands.splitCell()).toBe(true);
    expect(e.getHTML()).not.toContain('colspan="2"');
  });
});
