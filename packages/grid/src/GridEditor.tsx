import {
  createAutosaver,
  pickFiles,
  saveBlob,
  toFileName,
  writeDraft,
  type FileTypeOption,
  type SaveStatus,
} from '@free360/storage';
import { APPS } from '@free360/core';
import {
  AppShell,
  Button,
  ConfirmDialog,
  DialogFrame,
  PromptDialog,
  useRegisterCommands,
  useRegistry,
  type EditorAppProps,
} from '@free360/ui';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { ChartBox } from './ChartBox';
import { readChartData, renderChartImage } from './charts';
import { pasteCopied, pasteText, toClipboardText, type CopiedCells } from './clipboard';
import { createGridCommands } from './commands';
import { displayText, summarize } from './display';
import { FilterDialog } from './FilterDialog';
import { FormulaBar } from './FormulaBar';
import { buildGridRibbon } from './gridRibbon';
import styles from './GridEditor.module.css';
import { SheetTabs } from './SheetTabs';
import { SheetView, type CellEdit, type Selection } from './SheetView';
import { columnValues, hiddenRows, usedRange } from './sortFilter';
import { GridStore } from './store';
import {
  activeSheet,
  cellKey,
  cellName,
  cleanSheetName,
  columnName,
  DEFAULT_COLUMN_WIDTH,
  GRID_SCHEMA_VERSION,
  MAX_COLUMNS,
  MAX_ROWS,
  nextSheetName,
  normalizeRange,
  rangeName,
  ROW_HEIGHT,
  type CellPoint,
  type CellRange,
  type ChartKind,
  type Workbook,
} from './workbook';

const XLSX_FILE_TYPE: FileTypeOption = {
  description: 'Spreadsheet',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  extensions: ['.xlsx'],
};

const CSV_FILE_TYPE: FileTypeOption = {
  description: 'Comma-separated values',
  mimeType: 'text/csv',
  extensions: ['.csv'],
};

const SAVE_LABELS: Record<SaveStatus, string> = {
  saved: 'Saved locally',
  pending: 'Saving…',
  saving: 'Saving…',
  error: 'Could not save. Export a copy to keep your work.',
};

const A1: CellPoint = { row: 0, column: 0 };
const START_SELECTION: Selection = { anchor: A1, focus: A1 };

type GridEditorProps = EditorAppProps & { initialWorkbook: Workbook };

/** Turns text like `B7` into a cell, if it is one. */
function parseLocation(text: string): CellPoint | undefined {
  const match = /^\s*([a-z]{1,2})([1-9][0-9]*)\s*$/i.exec(text);
  if (!match) return undefined;
  let column = 0;
  for (const letter of match[1]!.toUpperCase()) column = column * 26 + letter.charCodeAt(0) - 64;
  const row = Number(match[2]) - 1;
  column -= 1;
  return row < MAX_ROWS && column < MAX_COLUMNS ? { row, column } : undefined;
}

export function GridEditor({ meta, repo, shell, fileTab, initialWorkbook }: GridEditorProps) {
  const registry = useRegistry();
  const [store] = useState(() => new GridStore(initialWorkbook));
  const version = useSyncExternalStore(store.subscribe, store.getVersion);
  const workbook = store.getWorkbook();
  const sheet = activeSheet(workbook);

  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const selection = selections[sheet.id] ?? START_SELECTION;
  const [edit, setEdit] = useState<CellEdit | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [renamingSheet, setRenamingSheet] = useState<string | null>(null);
  const [filterColumn, setFilterColumn] = useState<number | null>(null);
  const [pendingImport, setPendingImport] = useState<{ workbook: Workbook; title: string } | null>(
    null,
  );

  const scrollerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLInputElement>(null);
  const copiedRef = useRef<CopiedCells | null>(null);

  const setSelection = (next: Selection) => {
    setSelections((all) => ({ ...all, [store.getWorkbook().activeSheetId]: next }));
  };

  const focusGrid = () => scrollerRef.current?.focus({ preventScroll: true });

  const hidden = useMemo(
    () => hiddenRows(sheet, store.engine),
    // The engine's results change with the version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sheet, version, store],
  );

  const autosaver = useMemo(
    () =>
      createAutosaver({
        save: () => repo.saveContent(meta.id, store.getWorkbook(), GRID_SCHEMA_VERSION),
      }),
    [repo, meta.id, store],
  );
  const saveStatus = useSyncExternalStore(autosaver.subscribe, autosaver.getStatus);

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      autosaver.markDirty();
      registry.notify();
    });
    const onLeave = () => {
      if (autosaver.getStatus() === 'saved') return;
      writeDraft(meta.id, store.getWorkbook());
      void autosaver.flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void autosaver.flush();
    };
    window.addEventListener('pagehide', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      void autosaver.flush();
    };
  }, [store, autosaver, registry, meta.id]);

  // Formatting buttons follow the selected cell.
  useEffect(() => registry.notify(), [registry, selection]);

  // Starts on the grid, ready for typing or arrow keys.
  useEffect(() => focusGrid(), []);

  // The cell editor appears when editing starts, and takes the keyboard.
  const editSource = edit?.source;
  useEffect(() => {
    if (editSource === 'cell') editorRef.current?.focus();
  }, [editSource]);

  const rawRange = (): CellRange => normalizeRange(selection.anchor, selection.focus);

  /** Trims a selection of whole rows or columns to the part of the sheet in use. */
  const usedPart = (range: CellRange): CellRange => {
    const wholeColumns = range.top === 0 && range.bottom === MAX_ROWS - 1;
    const wholeRows = range.left === 0 && range.right === MAX_COLUMNS - 1;
    if (!wholeColumns && !wholeRows) return range;
    const used = usedRange(sheet);
    return {
      ...range,
      bottom: wholeColumns ? Math.max(used?.bottom ?? 0, 0) : range.bottom,
      right: wholeRows ? Math.max(used?.right ?? 0, 0) : range.right,
    };
  };

  const moveTo = (point: CellPoint, extend = false) => {
    const clamped = {
      row: Math.min(Math.max(point.row, 0), MAX_ROWS - 1),
      column: Math.min(Math.max(point.column, 0), MAX_COLUMNS - 1),
    };
    setSelection({ anchor: extend ? selection.anchor : clamped, focus: clamped });
  };

  const rawText = (row: number, column: number): string => {
    const raw = sheet.cells[cellKey(row, column)]?.raw;
    return raw === undefined ? '' : String(raw);
  };

  const commitEdit = () => {
    if (!edit) return;
    if (edit.value !== rawText(edit.row, edit.column)) {
      store.enterValue(edit.row, edit.column, edit.value);
    }
    setEdit(null);
  };

  const finishEdit = (direction: 'down' | 'up' | 'right' | 'left' | 'stay') => {
    if (!edit) return;
    commitEdit();
    const { row, column } = edit;
    const next = {
      down: { row: row + 1, column },
      up: { row: row - 1, column },
      right: { row, column: column + 1 },
      left: { row, column: column - 1 },
      stay: { row, column },
    }[direction];
    moveTo(next);
    focusGrid();
  };

  const onEditKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finishEdit(event.shiftKey ? 'up' : 'down');
    } else if (event.key === 'Tab') {
      event.preventDefault();
      finishEdit(event.shiftKey ? 'left' : 'right');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setEdit(null);
      focusGrid();
    }
  };

  const startEdit = (value?: string) => {
    const { row, column } = selection.anchor;
    setSelection({ anchor: selection.anchor, focus: selection.anchor });
    setEdit({ row, column, value: value ?? rawText(row, column), source: 'cell' });
  };

  /** One step along a row or column, passing over rows a filter is hiding. */
  const stepRow = (row: number, delta: number): number => {
    let next = row + delta;
    while (hidden.has(next) && next > 0 && next < MAX_ROWS - 1) next += Math.sign(delta);
    return next;
  };

  /** Where Ctrl+arrow lands: the edge of the block of filled cells, or the next one. */
  const jump = (from: CellPoint, dRow: number, dColumn: number): CellPoint => {
    const filled = (p: CellPoint) => rawText(p.row, p.column) !== '';
    const inBounds = (p: CellPoint) =>
      p.row >= 0 && p.column >= 0 && p.row < MAX_ROWS && p.column < MAX_COLUMNS;
    const step = (p: CellPoint) => ({ row: p.row + dRow, column: p.column + dColumn });
    let current = from;
    let next = step(current);
    if (filled(current) && inBounds(next) && filled(next)) {
      while (inBounds(next) && filled(next)) {
        current = next;
        next = step(current);
      }
      return current;
    }
    while (inBounds(next) && !filled(next)) {
      current = next;
      next = step(current);
    }
    return inBounds(next) ? next : current;
  };

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const { focus, anchor } = selection;
    const mod = event.ctrlKey || event.metaKey;
    const go = (point: CellPoint) => {
      event.preventDefault();
      moveTo(point, event.shiftKey);
    };
    switch (event.key) {
      case 'ArrowDown':
        return go(mod ? jump(focus, 1, 0) : { ...focus, row: stepRow(focus.row, 1) });
      case 'ArrowUp':
        return go(mod ? jump(focus, -1, 0) : { ...focus, row: stepRow(focus.row, -1) });
      case 'ArrowRight':
        return go(mod ? jump(focus, 0, 1) : { ...focus, column: focus.column + 1 });
      case 'ArrowLeft':
        return go(mod ? jump(focus, 0, -1) : { ...focus, column: focus.column - 1 });
      case 'PageDown':
        return go({ ...focus, row: focus.row + 20 });
      case 'PageUp':
        return go({ ...focus, row: focus.row - 20 });
      case 'Home':
        return go(mod ? A1 : { ...focus, column: 0 });
      case 'End': {
        if (!mod) return go({ ...focus, column: usedRange(sheet)?.right ?? 0 });
        const used = usedRange(sheet);
        return go(used ? { row: used.bottom, column: used.right } : A1);
      }
      case 'Tab':
        event.preventDefault();
        moveTo({ ...anchor, column: anchor.column + (event.shiftKey ? -1 : 1) });
        return;
      case 'Enter':
        event.preventDefault();
        if (event.shiftKey) moveTo({ ...anchor, row: stepRow(anchor.row, -1) });
        else moveTo({ ...anchor, row: stepRow(anchor.row, 1) });
        return;
      case 'F2':
        event.preventDefault();
        startEdit();
        return;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        store.clearValues(usedPart(rawRange()));
        return;
    }
    if (mod && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      setSelection({
        anchor: { row: 0, column: 0 },
        focus: { row: MAX_ROWS - 1, column: MAX_COLUMNS - 1 },
      });
      return;
    }
    // A character starts typing over the cell.
    if (event.key.length === 1 && !mod && !event.altKey) {
      event.preventDefault();
      startEdit(event.key);
    }
  };

  const onPointToCell = (point: CellPoint): boolean => {
    if (!edit) return false;
    // While a formula is waiting for a reference, a click adds the cell to it.
    if (/^=.*[=(+\-*/,:&^<>]$/.test(edit.value) || edit.value === '=') {
      setEdit({ ...edit, value: edit.value + cellName(point.row, point.column) });
      return true;
    }
    commitEdit();
    return false;
  };

  const copySelection = (event: ClipboardEvent, cut: boolean) => {
    if (event.target !== scrollerRef.current) return;
    event.preventDefault();
    const range = usedPart(rawRange());
    const text: string[][] = [];
    const cells: CopiedCells['cells'] = [];
    for (let row = range.top; row <= range.bottom; row++) {
      const shown: string[] = [];
      const kept: CopiedCells['cells'][number] = [];
      for (let column = range.left; column <= range.right; column++) {
        const cell = sheet.cells[cellKey(row, column)];
        shown.push(displayText(store.engine.result(sheet, row, column), cell?.style?.format));
        kept.push(cell);
      }
      text.push(shown);
      cells.push(kept);
    }
    const clipboardText = toClipboardText(text);
    event.clipboardData.setData('text/plain', clipboardText);
    copiedRef.current = { text: clipboardText, range, cells };
    if (cut) {
      store.replaceCells(
        'Cut',
        cells.flatMap((values, rowOffset) =>
          values.map((_, columnOffset) => ({
            row: range.top + rowOffset,
            column: range.left + columnOffset,
          })),
        ),
      );
    }
  };

  const onPaste = (event: ClipboardEvent) => {
    if (event.target !== scrollerRef.current) return;
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    const target = usedPart(rawRange());
    const copied = copiedRef.current;
    // The same text means it's what was copied here, so formulas and formatting can come too.
    const replacements =
      copied && copied.text === text ? pasteCopied(copied, target) : pasteText(text, target);
    store.replaceCells('Paste', replacements);
  };

  const applyWorkbook = (next: Workbook, title: string) => {
    store.replaceWorkbook('Import', next);
    if (meta.title === APPS.grid.defaultTitle) shell.onTitleChange?.(title);
    setEdit(null);
  };

  const fail = (message: string) => (error: unknown) => {
    console.error(error);
    setNotice(message);
  };

  const addChart = (kind: ChartKind) => {
    let range = usedPart(rawRange());
    if (range.top === range.bottom && range.left === range.right) {
      const used = usedRange(sheet);
      if (!used) {
        setNotice('Select the cells to chart first. Add some numbers if the sheet is empty.');
        return;
      }
      range = used;
    }
    // Beside the data, so it doesn't cover any of it.
    let x = 0;
    const lastColumn = Math.max(range.right, usedRange(sheet)?.right ?? 0);
    for (let column = 0; column <= lastColumn; column++) {
      x += sheet.columnWidths[column] ?? DEFAULT_COLUMN_WIDTH;
    }
    const offset = sheet.charts.length * 24;
    store.setCharts('Add chart', (charts) => [
      ...charts,
      {
        id: crypto.randomUUID(),
        kind,
        range,
        x: x + 16 + offset,
        y: range.top * ROW_HEIGHT + offset,
        width: 420,
        height: 280,
      },
    ]);
  };

  const activeStyle = () => {
    const { row, column } = selection.anchor;
    return sheet.cells[cellKey(row, column)]?.style ?? {};
  };

  // These only use the refs when a command runs, not while rendering.
  useRegisterCommands(
    // eslint-disable-next-line react-hooks/refs
    createGridCommands({
      store,
      getRange: () => usedPart(rawRange()),
      getRawRange: rawRange,
      getActive: () => selection.anchor,
      focusGrid,
      addChart,
      save: () => autosaver.flush(),
      async importXlsx() {
        const [file] = await pickFiles([XLSX_FILE_TYPE]);
        if (!file) return;
        try {
          const { importXlsx } = await import('./io/xlsx');
          const next = await importXlsx(await file.arrayBuffer());
          const title = file.name.replace(/\.xlsx$/i, '');
          const hasData = workbook.sheets.some((s) => usedRange(s));
          if (hasData) setPendingImport({ workbook: next, title });
          else applyWorkbook(next, title);
        } catch (error) {
          fail(`Could not read “${file.name}”. It may be damaged or not a .xlsx file.`)(error);
        }
      },
      async exportXlsx() {
        try {
          const { exportXlsx } = await import('./io/xlsx');
          const images: Parameters<typeof exportXlsx>[2] = {};
          for (const s of workbook.sheets) {
            images[s.id] = await Promise.all(
              s.charts.map(async (chart) => ({
                base64: await renderChartImage(
                  chart.kind,
                  readChartData(s, store.engine, chart.range, hiddenRows(s, store.engine)),
                  chart.width,
                  chart.height,
                ),
                x: chart.x,
                y: chart.y,
                width: chart.width,
                height: chart.height,
              })),
            );
          }
          const blob = await exportXlsx(workbook, store.engine, images);
          await saveBlob(blob, toFileName(meta.title, 'xlsx'), XLSX_FILE_TYPE);
        } catch (error) {
          fail('Could not export this spreadsheet.')(error);
        }
      },
      async importCsv() {
        const [file] = await pickFiles([CSV_FILE_TYPE]);
        if (!file) return;
        try {
          const { csvToSheet } = await import('./io/csv');
          const base = cleanSheetName(file.name.replace(/\.csv$/i, '')) || 'Data';
          const taken = workbook.sheets.some((s) => s.name.toLowerCase() === base.toLowerCase());
          const name = taken ? nextSheetName(workbook.sheets, `${base} `) : base;
          store.addSheet(csvToSheet(await file.text(), name));
        } catch (error) {
          fail(`Could not read “${file.name}”.`)(error);
        }
      },
      async exportCsv() {
        try {
          const { sheetToCsv } = await import('./io/csv');
          const blob = new Blob([sheetToCsv(sheet, store.engine)], { type: 'text/csv' });
          const name = workbook.sheets.length > 1 ? `${meta.title} - ${sheet.name}` : meta.title;
          await saveBlob(blob, toFileName(name, 'csv'), CSV_FILE_TYPE);
        } catch (error) {
          fail('Could not export this sheet.')(error);
        }
      },
    }),
  );

  const stats = useMemo(() => {
    const range = usedPart(normalizeRange(selection.anchor, selection.focus));
    if (range.top === range.bottom && range.left === range.right) return null;
    const results = [];
    for (let row = range.top; row <= range.bottom; row++) {
      if (hidden.has(row)) continue;
      for (let column = range.left; column <= range.right; column++) {
        results.push(store.engine.result(sheet, row, column));
      }
    }
    return summarize(results);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, sheet, version, hidden, store]);

  const location = rangeName(normalizeRange(selection.anchor, selection.focus));
  const barValue = edit?.value ?? rawText(selection.anchor.row, selection.anchor.column);
  const shortNumber = (value: number) => String(Number(value.toPrecision(10)));
  const renaming = workbook.sheets.find((s) => s.id === renamingSheet);

  return (
    <AppShell
      {...shell}
      ribbon={buildGridRibbon(fileTab, activeStyle)}
      status={{
        left: (
          <>
            <span>FreeGrid</span>
            {stats && (
              <span data-testid="selection-stats">
                {stats.numbers > 0 &&
                  `Sum: ${shortNumber(stats.sum)}  Average: ${shortNumber(stats.average)}  `}
                Count: {stats.count}
              </span>
            )}
          </>
        ),
        right: <span role="status">{SAVE_LABELS[saveStatus]}</span>,
      }}
    >
      <div className={styles.layout}>
        <FormulaBar
          location={location}
          value={barValue}
          inputRef={barRef}
          onFocus={() => {
            if (edit?.source === 'bar') return;
            const { row, column } = selection.anchor;
            setEdit({ row, column, value: edit?.value ?? rawText(row, column), source: 'bar' });
          }}
          onChange={(value) => edit && setEdit({ ...edit, value })}
          onKeyDown={onEditKeyDown}
          onGoTo={(text) => {
            const point = parseLocation(text);
            if (!point) return false;
            moveTo(point);
            focusGrid();
            return true;
          }}
        />
        <SheetView
          sheet={sheet}
          engine={store.engine}
          version={version}
          hiddenRows={hidden}
          selection={selection}
          edit={edit}
          scrollerRef={scrollerRef}
          editorRef={editorRef}
          onSelect={setSelection}
          onPointToCell={onPointToCell}
          onEditChange={(value) => edit && setEdit({ ...edit, value })}
          onEditKeyDown={onEditKeyDown}
          onGridKeyDown={onGridKeyDown}
          onCopy={(event) => copySelection(event, false)}
          onCut={(event) => copySelection(event, true)}
          onPaste={onPaste}
          onResizeColumn={(column, width) => store.setColumnWidth(column, width)}
          onOpenFilter={setFilterColumn}
          overlay={sheet.charts.map((chart) => (
            <ChartBox
              key={chart.id}
              chart={chart}
              data={readChartData(sheet, store.engine, chart.range, hidden)}
              onMove={(patch) =>
                store.setCharts('Move chart', (charts) =>
                  charts.map((c) => (c.id === chart.id ? { ...c, ...patch } : c)),
                )
              }
              onDelete={() =>
                store.setCharts('Delete chart', (charts) => charts.filter((c) => c.id !== chart.id))
              }
            />
          ))}
        />
        <SheetTabs
          sheets={workbook.sheets}
          activeId={sheet.id}
          onSelect={(id) => {
            commitEdit();
            store.setActiveSheet(id);
            focusGrid();
          }}
          onAdd={() => {
            commitEdit();
            store.addSheet();
            focusGrid();
          }}
          onRename={setRenamingSheet}
          onDelete={(id) => store.removeSheet(id)}
        />
      </div>
      <PromptDialog
        open={renaming !== undefined}
        onOpenChange={(open) => {
          if (!open) setRenamingSheet(null);
        }}
        title="Rename sheet"
        label="Sheet name"
        initialValue={renaming?.name ?? ''}
        confirmLabel="Rename"
        onSubmit={(name) => {
          if (renaming && !store.renameSheet(renaming.id, name)) {
            setNotice(`“${name}” can't be used: sheet names must be different from each other.`);
          }
        }}
      />
      {filterColumn !== null && sheet.filter && (
        <FilterDialog
          columnName={columnName(filterColumn)}
          values={columnValues(sheet, store.engine, filterColumn)}
          hidden={sheet.filter.hidden[filterColumn] ?? []}
          onClose={() => {
            setFilterColumn(null);
            focusGrid();
          }}
          onApply={(values) => {
            const { filter } = sheet;
            if (filter) {
              store.setFilter({
                ...filter,
                hidden: { ...filter.hidden, [filterColumn]: values },
              });
            }
          }}
        />
      )}
      <ConfirmDialog
        open={pendingImport !== null}
        onOpenChange={(open) => {
          if (!open) setPendingImport(null);
        }}
        title="Replace this spreadsheet?"
        description="The imported file will replace what's here now. You can undo this."
        confirmLabel="Replace"
        onConfirm={() => {
          if (pendingImport) applyWorkbook(pendingImport.workbook, pendingImport.title);
        }}
      />
      <DialogFrame
        open={notice !== null}
        onOpenChange={(open) => {
          if (!open) setNotice(null);
        }}
        title="Something went wrong"
        description={notice}
      >
        <div className={styles.noticeActions}>
          <Button variant="primary" onClick={() => setNotice(null)}>
            OK
          </Button>
        </div>
      </DialogFrame>
    </AppShell>
  );
}
