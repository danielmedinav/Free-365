import { createUndoCommands, type Command } from '@free360/commands';
import { HIGHLIGHT_COLORS, slug, TEXT_COLORS } from './palette';
import { currentRegion, createFilter, looksLikeHeader, sortedRows } from './sortFilter';
import type { GridStore } from './store';
import {
  activeSheet,
  cellKey,
  type CellPoint,
  type CellRange,
  type CellStyle,
  type ChartKind,
  type NumberFormat,
} from './workbook';

export type GridActions = {
  store: GridStore;
  /** The selection, trimmed to the used part of the sheet if whole rows or columns are selected. */
  getRange: () => CellRange;
  getRawRange: () => CellRange;
  getActive: () => CellPoint;
  focusGrid: () => void;
  save: () => void | Promise<unknown>;
  addChart: (kind: ChartKind) => void;
  importXlsx: () => void | Promise<unknown>;
  exportXlsx: () => void | Promise<unknown>;
  importCsv: () => void | Promise<unknown>;
  exportCsv: () => void | Promise<unknown>;
};

export const NUMBER_FORMATS: { value: NumberFormat; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'percent', label: 'Percent' },
  { value: 'date', label: 'Date' },
];

export function createGridCommands(actions: GridActions): Command[] {
  const { store, getRange, getRawRange, getActive, focusGrid } = actions;

  const sheet = () => activeSheet(store.getWorkbook());
  const activeStyle = (): CellStyle => {
    const { row, column } = getActive();
    return sheet().cells[cellKey(row, column)]?.style ?? {};
  };
  /** Keeps the keyboard in the grid after using a button. */
  const inGrid = (run: () => void) => () => {
    run();
    focusGrid();
    // Again once any menu that ran this has closed, as it holds on to focus until then. By then
    // the keyboard may have moved on to something else, which keeps it.
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) focusGrid();
    });
  };
  const style = (patch: CellStyle) => inGrid(() => store.applyStyle(getRange(), patch));

  const toggle = (
    id: string,
    label: string,
    shortcut: string,
    key: 'bold' | 'italic' | 'underline',
  ): Command => ({
    id,
    label,
    shortcut,
    run: () => style({ [key]: !activeStyle()[key] })(),
    isActive: () => !!activeStyle()[key],
  });

  const sort = (direction: 1 | -1) =>
    inGrid(() => {
      const current = sheet();
      const selected = getRawRange();
      const { row, column } = getActive();
      const single = selected.top === selected.bottom;
      let range = single ? currentRegion(current, row, column) : getRange();
      if (current.filter) {
        // A filter's first row is its headings.
        range = { ...current.filter, top: current.filter.top + 1 };
      } else if (single && looksLikeHeader(current, range, store.engine)) {
        range = { ...range, top: range.top + 1 };
      }
      if (range.bottom < range.top) return;
      store.replaceCells('Sort', sortedRows(current, store.engine, range, column, direction));
    });

  return [
    // In the formula bar and cell editor, Ctrl+Z must undo that field's text, not the sheet.
    ...createUndoCommands(() => store.history).map((command) => ({
      ...command,
      allowInInputs: false,
    })),

    toggle('grid.bold', 'Bold', 'Mod+B', 'bold'),
    toggle('grid.italic', 'Italic', 'Mod+I', 'italic'),
    toggle('grid.underline', 'Underline', 'Mod+U', 'underline'),

    ...(['left', 'center', 'right'] as const).map((align): Command => ({
      id: `grid.align-${align}`,
      label: `Align ${align}`,
      run: style({ align }),
      isActive: () => activeStyle().align === align,
    })),

    ...NUMBER_FORMATS.map(({ value, label }): Command => ({
      id: `grid.format-${value}`,
      label,
      run: style({ format: value }),
      isActive: () => (activeStyle().format ?? 'general') === value,
    })),

    {
      id: 'grid.textColor-default',
      label: 'Automatic color',
      run: style({ color: undefined }),
    },
    ...TEXT_COLORS.map(({ name, hex }): Command => ({
      id: `grid.textColor-${slug(name)}`,
      label: `${name} text`,
      run: style({ color: hex }),
    })),
    {
      id: 'grid.fill-default',
      label: 'No fill',
      run: style({ fill: undefined }),
    },
    ...HIGHLIGHT_COLORS.map(({ name, hex }): Command => ({
      id: `grid.fill-${slug(name)}`,
      label: `${name} fill`,
      run: style({ fill: hex }),
    })),

    {
      id: 'grid.insertRows',
      label: 'Insert rows',
      description: 'Insert as many rows as are selected, above the selection',
      run: inGrid(() => {
        const { top, bottom } = getRawRange();
        store.insertRows(top, bottom - top + 1);
      }),
    },
    {
      id: 'grid.deleteRows',
      label: 'Delete rows',
      run: inGrid(() => {
        const { top, bottom } = getRawRange();
        store.removeRows(top, bottom - top + 1);
      }),
    },
    {
      id: 'grid.insertColumns',
      label: 'Insert columns',
      description: 'Insert as many columns as are selected, to the left of the selection',
      run: inGrid(() => {
        const { left, right } = getRawRange();
        store.insertColumns(left, right - left + 1);
      }),
    },
    {
      id: 'grid.deleteColumns',
      label: 'Delete columns',
      run: inGrid(() => {
        const { left, right } = getRawRange();
        store.removeColumns(left, right - left + 1);
      }),
    },

    {
      id: 'grid.sortAscending',
      label: 'Sort A to Z',
      description: 'Sort by the selected column, smallest first',
      run: sort(1),
    },
    {
      id: 'grid.sortDescending',
      label: 'Sort Z to A',
      description: 'Sort by the selected column, largest first',
      run: sort(-1),
    },
    {
      id: 'grid.filter',
      label: 'Filter',
      description: 'Add filter buttons to the headings of the selected data',
      run: inGrid(() => {
        const current = sheet();
        if (current.filter) {
          store.setFilter(undefined);
          return;
        }
        const selected = getRawRange();
        const { row, column } = getActive();
        const range =
          selected.top === selected.bottom ? currentRegion(current, row, column) : getRange();
        store.setFilter(createFilter(range));
      }),
      isActive: () => !!sheet().filter,
    },

    ...(['bar', 'line', 'pie'] as const).map((kind): Command => ({
      id: `grid.chart-${kind}`,
      label: { bar: 'Bar chart', line: 'Line chart', pie: 'Pie chart' }[kind],
      description: 'Make a chart from the selected cells',
      run: () => actions.addChart(kind),
    })),

    {
      id: 'grid.save',
      label: 'Save',
      description: 'Your work saves automatically; this saves right now',
      shortcut: 'Mod+S',
      allowInInputs: true,
      run: actions.save,
    },
    {
      id: 'grid.importXlsx',
      label: 'Import .xlsx',
      description: 'Replace this spreadsheet with the contents of a .xlsx file',
      run: actions.importXlsx,
    },
    {
      id: 'grid.exportXlsx',
      label: 'Export .xlsx',
      description: 'Save a copy as a .xlsx file',
      run: actions.exportXlsx,
    },
    {
      id: 'grid.importCsv',
      label: 'Import .csv',
      description: 'Add a .csv file as a new sheet',
      run: actions.importCsv,
    },
    {
      id: 'grid.exportCsv',
      label: 'Export .csv',
      description: 'Save the current sheet as a .csv file',
      run: actions.exportCsv,
    },
  ];
}
