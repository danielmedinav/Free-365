import { createHistory, type History } from '@free360/commands';
import { FormulaEngine, shiftCells } from './engine';
import {
  activeSheet,
  cellKey,
  cleanSheetName,
  createSheet,
  nextSheetName,
  type Cell,
  type CellRange,
  type CellStyle,
  type ChartDefinition,
  type RawValue,
  type Sheet,
  type SheetFilter,
  type Workbook,
} from './workbook';

export type CellChange = { row: number; column: number; raw?: RawValue; style?: CellStyle };

/**
 * Holds the workbook, its formula engine, and its undo history. Every change goes through `commit`,
 * so a formula edit and a formatting change undo the same way.
 */
export class GridStore {
  readonly history: History = createHistory();
  readonly engine: FormulaEngine;
  private workbook: Workbook;
  private version = 0;
  private readonly listeners = new Set<() => void>();

  constructor(workbook: Workbook) {
    this.workbook = workbook;
    this.engine = new FormulaEngine(workbook);
  }

  getWorkbook = () => this.workbook;
  getVersion = () => this.version;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  destroy() {
    this.engine.destroy();
  }

  private show(next: Workbook) {
    this.workbook = next;
    this.version++;
    this.listeners.forEach((listener) => listener());
  }

  /** Records a change. Pass `synced` when the engine already has the new contents. */
  private commit(label: string, next: Workbook, synced = false) {
    const previous = this.workbook;
    if (next === previous) return;
    if (!synced) this.engine.sync(previous, next);
    this.show(next);
    this.history.push({
      label,
      undo: () => {
        this.engine.sync(this.workbook, previous);
        this.show(previous);
      },
      redo: () => {
        this.engine.sync(this.workbook, next);
        this.show(next);
      },
    });
  }

  private withSheet(sheetId: string, update: (sheet: Sheet) => Sheet): Workbook {
    return {
      ...this.workbook,
      sheets: this.workbook.sheets.map((sheet) => (sheet.id === sheetId ? update(sheet) : sheet)),
    };
  }

  private get current(): Sheet {
    return activeSheet(this.workbook);
  }

  /** Sets entered values and styles. A `style` patch merges with what the cell has. */
  setCells(label: string, changes: CellChange[]) {
    if (!changes.length) return;
    const next = this.withSheet(this.current.id, (sheet) => {
      const cells = { ...sheet.cells };
      for (const { row, column, raw, style } of changes) {
        const key = cellKey(row, column);
        const cell: Cell = { ...cells[key] };
        if (raw !== undefined) cell.raw = raw;
        if (style) cell.style = { ...cell.style, ...style };
        cells[key] = cell;
      }
      return { ...sheet, cells };
    });
    this.commit(label, next);
  }

  enterValue(row: number, column: number, raw: string) {
    this.setCells('Edit cell', [{ row, column, raw }]);
  }

  /** Empties cells, keeping their formatting. */
  clearValues(range: CellRange) {
    const next = this.withSheet(this.current.id, (sheet) => {
      const cells = { ...sheet.cells };
      for (let row = range.top; row <= range.bottom; row++) {
        for (let column = range.left; column <= range.right; column++) {
          const key = cellKey(row, column);
          const cell = cells[key];
          if (!cell) continue;
          if (cell.style) cells[key] = { style: cell.style };
          else delete cells[key];
        }
      }
      return { ...sheet, cells };
    });
    this.commit('Clear', next);
  }

  /** Replaces whole cells, including formatting; undefined removes the cell. */
  replaceCells(label: string, replacements: { row: number; column: number; cell?: Cell }[]) {
    if (!replacements.length) return;
    const next = this.withSheet(this.current.id, (sheet) => {
      const cells = { ...sheet.cells };
      for (const { row, column, cell } of replacements) {
        if (cell) cells[cellKey(row, column)] = cell;
        else delete cells[cellKey(row, column)];
      }
      return { ...sheet, cells };
    });
    this.commit(label, next);
  }

  applyStyle(range: CellRange, style: CellStyle) {
    const changes: CellChange[] = [];
    for (let row = range.top; row <= range.bottom; row++) {
      for (let column = range.left; column <= range.right; column++) {
        changes.push({ row, column, style });
      }
    }
    this.setCells('Format', changes);
  }

  /** Cells and every formula pointing at them move, as do charts and filters beyond the change. */
  insertRows(at: number, count: number) {
    const sheet = this.current;
    const moved = this.withSheet(sheet.id, (s) => ({
      ...s,
      cells: shiftCells(s.cells, 'row', at, count),
      filter: shiftFilter(s.filter, 'row', at, count),
      charts: s.charts.map((chart) => ({
        ...chart,
        range: shiftRange(chart.range, 'row', at, count),
      })),
    }));
    this.commit('Insert rows', this.engine.insertRows(moved, sheet, at, count), true);
  }

  removeRows(at: number, count: number) {
    const sheet = this.current;
    const moved = this.withSheet(sheet.id, (s) => ({
      ...s,
      cells: shiftCells(s.cells, 'row', at, -count),
      filter: shiftFilter(s.filter, 'row', at, -count),
      charts: s.charts.map((chart) => ({
        ...chart,
        range: shiftRange(chart.range, 'row', at, -count),
      })),
    }));
    this.commit('Delete rows', this.engine.removeRows(moved, sheet, at, count), true);
  }

  insertColumns(at: number, count: number) {
    const sheet = this.current;
    const moved = this.withSheet(sheet.id, (s) => ({
      ...s,
      cells: shiftCells(s.cells, 'column', at, count),
      columnWidths: shiftWidths(s.columnWidths, at, count),
      filter: shiftFilter(s.filter, 'column', at, count),
      charts: s.charts.map((chart) => ({
        ...chart,
        range: shiftRange(chart.range, 'column', at, count),
      })),
    }));
    this.commit('Insert columns', this.engine.insertColumns(moved, sheet, at, count), true);
  }

  removeColumns(at: number, count: number) {
    const sheet = this.current;
    const moved = this.withSheet(sheet.id, (s) => ({
      ...s,
      cells: shiftCells(s.cells, 'column', at, -count),
      columnWidths: shiftWidths(s.columnWidths, at, -count),
      filter: shiftFilter(s.filter, 'column', at, -count),
      charts: s.charts.map((chart) => ({
        ...chart,
        range: shiftRange(chart.range, 'column', at, -count),
      })),
    }));
    this.commit('Delete columns', this.engine.removeColumns(moved, sheet, at, count), true);
  }

  setColumnWidth(column: number, width: number) {
    const next = this.withSheet(this.current.id, (sheet) => ({
      ...sheet,
      columnWidths: { ...sheet.columnWidths, [column]: Math.max(24, Math.round(width)) },
    }));
    this.commit('Resize column', next);
  }

  /** Switching sheets isn't an edit, so it's not on the undo history. */
  setActiveSheet(id: string) {
    if (id !== this.workbook.activeSheetId) this.show({ ...this.workbook, activeSheetId: id });
  }

  addSheet(sheet: Sheet = createSheet(nextSheetName(this.workbook.sheets))) {
    this.commit('Add sheet', {
      sheets: [...this.workbook.sheets, sheet],
      activeSheetId: sheet.id,
    });
    return sheet;
  }

  /** Returns false if the name is empty or already taken. */
  renameSheet(id: string, name: string): boolean {
    const clean = cleanSheetName(name);
    const sheet = this.workbook.sheets.find((s) => s.id === id);
    if (!clean || !sheet) return false;
    if (clean === sheet.name) return true;
    const taken = this.workbook.sheets.some(
      (s) => s.id !== id && s.name.toLowerCase() === clean.toLowerCase(),
    );
    if (taken) return false;
    this.commit('Rename sheet', this.engine.renameSheet(this.workbook, sheet, clean), true);
    return true;
  }

  removeSheet(id: string) {
    const sheet = this.workbook.sheets.find((s) => s.id === id);
    if (!sheet || this.workbook.sheets.length < 2) return;
    const index = this.workbook.sheets.indexOf(sheet);
    const next = this.engine.removeSheet(this.workbook, sheet);
    const neighbor = next.sheets[Math.min(index, next.sheets.length - 1)]!;
    this.commit(
      'Delete sheet',
      { ...next, activeSheetId: id === next.activeSheetId ? neighbor.id : next.activeSheetId },
      true,
    );
  }

  setFilter(filter: SheetFilter | undefined) {
    this.commit(
      filter ? 'Filter' : 'Remove filter',
      this.withSheet(this.current.id, (sheet) => ({ ...sheet, filter })),
    );
  }

  setCharts(label: string, update: (charts: ChartDefinition[]) => ChartDefinition[]) {
    this.commit(
      label,
      this.withSheet(this.current.id, (sheet) => ({ ...sheet, charts: update(sheet.charts) })),
    );
  }

  /** Replaces everything, as when a file is opened. Can be undone. */
  replaceWorkbook(label: string, workbook: Workbook) {
    this.commit(label, workbook);
  }
}

function shiftWidths(widths: Record<number, number>, at: number, delta: number) {
  const shifted: Record<number, number> = {};
  for (const [key, width] of Object.entries(widths)) {
    const column = Number(key);
    if (delta < 0 && column >= at && column < at - delta) continue;
    shifted[column >= at ? column + delta : column] = width;
  }
  return shifted;
}

function shiftRange<T extends CellRange>(
  range: T,
  axis: 'row' | 'column',
  at: number,
  delta: number,
): T {
  const [start, end] = axis === 'row' ? (['top', 'bottom'] as const) : (['left', 'right'] as const);
  const moved = { ...range };
  if (range[start] >= at) moved[start] = Math.max(at, range[start] + delta);
  if (range[end] >= at) moved[end] = Math.max(moved[start], range[end] + delta);
  return moved;
}

function shiftFilter(
  filter: SheetFilter | undefined,
  axis: 'row' | 'column',
  at: number,
  delta: number,
): SheetFilter | undefined {
  if (!filter) return filter;
  const moved = shiftRange(filter, axis, at, delta);
  return axis === 'column'
    ? { ...moved, hidden: shiftColumnKeys(filter.hidden, at, delta) }
    : moved;
}

function shiftColumnKeys(hidden: Record<number, string[]>, at: number, delta: number) {
  const shifted: Record<number, string[]> = {};
  for (const [key, values] of Object.entries(hidden)) {
    const column = Number(key);
    if (delta < 0 && column >= at && column < at - delta) continue;
    shifted[column >= at ? column + delta : column] = values;
  }
  return shifted;
}
