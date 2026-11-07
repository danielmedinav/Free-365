import { ListFilter } from 'lucide-react';
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createAxis } from './axis';
import { defaultAlignment, displayText } from './display';
import type { FormulaEngine } from './engine';
import styles from './SheetView.module.css';
import {
  cellKey,
  cellName,
  columnName,
  DEFAULT_COLUMN_WIDTH,
  MAX_COLUMNS,
  MAX_ROWS,
  normalizeRange,
  ROW_HEIGHT,
  type CellPoint,
  type CellStyle,
  type Sheet,
} from './workbook';

const HEADER_WIDTH = 48;
const HEADER_HEIGHT = 24;
/** Extra rows and columns rendered around the visible area, so fast scrolling stays filled in. */
const OVERSCAN = 4;

export type Selection = { anchor: CellPoint; focus: CellPoint };

export type CellEdit = { row: number; column: number; value: string; source: 'cell' | 'bar' };

type SheetViewProps = {
  sheet: Sheet;
  engine: FormulaEngine;
  /** Changes whenever cell contents do, as the engine isn't visible to React. */
  version: number;
  hiddenRows: Set<number>;
  selection: Selection;
  edit: CellEdit | null;
  scrollerRef: RefObject<HTMLDivElement | null>;
  editorRef: RefObject<HTMLInputElement | null>;
  onSelect: (selection: Selection) => void;
  /** A click while typing a formula, which adds that cell to it. Returns true if it was used. */
  onPointToCell: (point: CellPoint) => boolean;
  onEditChange: (value: string) => void;
  onEditKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onGridKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onCopy: (event: ClipboardEvent) => void;
  onCut: (event: ClipboardEvent) => void;
  onPaste: (event: ClipboardEvent) => void;
  onResizeColumn: (column: number, width: number) => void;
  onOpenFilter: (column: number) => void;
  /** Charts and anything else floating over the cells. */
  overlay?: ReactNode;
};

type CellViewProps = {
  name: string;
  row: number;
  column: number;
  text: string;
  isError: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
  align: 'left' | 'center' | 'right';
  style: CellStyle | undefined;
  filterButton: boolean;
  onOpenFilter: (column: number) => void;
};

/** Memoized: scrolling redraws the grid, but most cells stay exactly as they were. */
const CellView = memo(function CellView({
  name,
  row,
  column,
  text,
  isError,
  left,
  top,
  width,
  height,
  align,
  style,
  filterButton,
  onOpenFilter,
}: CellViewProps) {
  const css: CSSProperties = { left, top, width, height, textAlign: align };
  if (style?.bold) css.fontWeight = 700;
  if (style?.italic) css.fontStyle = 'italic';
  if (style?.underline) css.textDecoration = 'underline';
  if (style?.color) css.color = style.color;
  if (style?.fill) {
    css.background = style.fill;
    css.color = style.color ?? 'var(--fs-on-fill)';
  }
  return (
    <div
      role="gridcell"
      aria-rowindex={row + 2}
      aria-colindex={column + 2}
      data-cell={name}
      className={`${styles.cell} ${isError ? styles.error : ''}`}
      style={css}
    >
      {text}
      {filterButton && (
        <button
          type="button"
          className={styles.filterButton}
          aria-label={`Filter column ${columnName(column)}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onOpenFilter(column)}
        >
          <ListFilter size={12} aria-hidden />
        </button>
      )}
    </div>
  );
});

/** The scrolling grid. It renders only what's on screen, so sheets can be very large. */
export function SheetView({
  sheet,
  engine,
  version,
  hiddenRows,
  selection,
  edit,
  scrollerRef,
  editorRef,
  onSelect,
  onPointToCell,
  onEditChange,
  onEditKeyDown,
  onGridKeyDown,
  onCopy,
  onCut,
  onPaste,
  onResizeColumn,
  onOpenFilter,
  overlay,
}: SheetViewProps) {
  const [scroll, setScroll] = useState({ left: 0, top: 0, width: 1200, height: 800 });

  const columns = useMemo(
    () => createAxis(MAX_COLUMNS, (i) => sheet.columnWidths[i] ?? DEFAULT_COLUMN_WIDTH),
    [sheet.columnWidths],
  );
  const rows = useMemo(
    () => createAxis(MAX_ROWS, (i) => (hiddenRows.has(i) ? 0 : ROW_HEIGHT)),
    [hiddenRows],
  );

  // Keeps the size in step with the window.
  useLayoutEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const measure = () => {
      setScroll({
        left: element.scrollLeft,
        top: element.scrollTop,
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollerRef]);

  // Each sheet has its own scroll position; a new one starts at the top.
  useLayoutEffect(() => {
    const element = scrollerRef.current;
    if (element) element.scrollTo(0, 0);
  }, [scrollerRef, sheet.id]);

  // Keeps the selected cell in view as it moves.
  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const { row, column } = selection.focus;
    const left = columns.start(column);
    const right = left + columns.size(column);
    const top = rows.start(row);
    const bottom = top + rows.size(row);
    const viewWidth = element.clientWidth - HEADER_WIDTH;
    const viewHeight = element.clientHeight - HEADER_HEIGHT;
    let { scrollLeft, scrollTop } = element;
    if (left < scrollLeft) scrollLeft = left;
    else if (right > scrollLeft + viewWidth) scrollLeft = right - viewWidth;
    if (top < scrollTop) scrollTop = top;
    else if (bottom > scrollTop + viewHeight) scrollTop = bottom - viewHeight;
    element.scrollTo(scrollLeft, scrollTop);
  }, [scrollerRef, selection.focus, columns, rows]);

  const firstColumn = Math.max(0, columns.indexAt(scroll.left) - OVERSCAN);
  const lastColumn = Math.min(
    MAX_COLUMNS - 1,
    columns.indexAt(scroll.left + scroll.width) + OVERSCAN,
  );
  const firstRow = Math.max(0, rows.indexAt(scroll.top) - OVERSCAN);
  const lastRow = Math.min(MAX_ROWS - 1, rows.indexAt(scroll.top + scroll.height) + OVERSCAN);

  const pointAt = (clientX: number, clientY: number): CellPoint => {
    const rect = scrollerRef.current!.getBoundingClientRect();
    const x = clientX - rect.left + scrollerRef.current!.scrollLeft - HEADER_WIDTH;
    const y = clientY - rect.top + scrollerRef.current!.scrollTop - HEADER_HEIGHT;
    return { row: rows.indexAt(Math.max(y, 0)), column: columns.indexAt(Math.max(x, 0)) };
  };

  // The latest selection, for the handlers a drag keeps for its whole length.
  const selectRef = useRef(onSelect);
  useEffect(() => {
    selectRef.current = onSelect;
  });

  /** Selecting by dragging: `at` turns a pointer position into the selection. */
  const startDrag = (event: ReactPointerEvent, at: (point: CellPoint) => Selection) => {
    if (event.button !== 0) return;
    event.preventDefault();
    scrollerRef.current?.focus({ preventScroll: true });
    selectRef.current(at(pointAt(event.clientX, event.clientY)));
    const onMove = (move: PointerEvent) => {
      selectRef.current(at(pointAt(move.clientX, move.clientY)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startCellDrag = (event: ReactPointerEvent) => {
    const point = pointAt(event.clientX, event.clientY);
    if (onPointToCell(point)) {
      event.preventDefault();
      return;
    }
    const anchor = event.shiftKey ? selection.anchor : point;
    startDrag(event, (focus) => ({ anchor, focus }));
  };

  const startColumnSelect = (event: ReactPointerEvent) => {
    const anchorColumn = pointAt(event.clientX, 0).column;
    startDrag(event, ({ column }) => ({
      anchor: { row: 0, column: anchorColumn },
      focus: { row: MAX_ROWS - 1, column },
    }));
  };

  const startRowSelect = (event: ReactPointerEvent) => {
    const anchorRow = pointAt(0, event.clientY).row;
    startDrag(event, ({ row }) => ({
      anchor: { row: anchorRow, column: 0 },
      focus: { row, column: MAX_COLUMNS - 1 },
    }));
  };

  const startColumnResize = (event: ReactPointerEvent, column: number) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columns.size(column);
    const guide = event.currentTarget.parentElement;
    const onMove = (move: PointerEvent) => {
      if (guide) guide.style.width = `${Math.max(24, startWidth + move.clientX - startX)}px`;
    };
    const onUp = (up: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (up.clientX !== startX) onResizeColumn(column, startWidth + up.clientX - startX);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const range = normalizeRange(selection.anchor, selection.focus);
  const selectedBox: CSSProperties = {
    left: columns.start(range.left),
    top: rows.start(range.top),
    width: columns.start(range.right) + columns.size(range.right) - columns.start(range.left),
    height: rows.start(range.bottom) + rows.size(range.bottom) - rows.start(range.top),
  };
  const focusBox: CSSProperties = {
    left: columns.start(selection.anchor.column),
    top: rows.start(selection.anchor.row),
    width: columns.size(selection.anchor.column),
    height: rows.size(selection.anchor.row),
  };

  const columnHeaders: ReactNode[] = [];
  for (let column = firstColumn; column <= lastColumn; column++) {
    const selected = column >= range.left && column <= range.right;
    columnHeaders.push(
      <div
        key={column}
        role="columnheader"
        aria-colindex={column + 2}
        className={`${styles.columnHeader} ${selected ? styles.headerSelected : ''}`}
        style={{ left: HEADER_WIDTH + columns.start(column), width: columns.size(column) }}
        onPointerDown={startColumnSelect}
      >
        {columnName(column)}
        <span
          className={styles.resizer}
          data-resize={columnName(column)}
          onPointerDown={(event) => startColumnResize(event, column)}
        />
      </div>,
    );
  }

  // Drawn one by one, as columns can have any width and filters can hide rows.
  const gridLines: ReactNode[] = [];
  for (let column = firstColumn; column <= lastColumn; column++) {
    gridLines.push(
      <div
        key={`column-${column}`}
        className={styles.columnLine}
        style={{ left: columns.start(column) + columns.size(column) - 1 }}
      />,
    );
  }

  const rowHeaders: ReactNode[] = [];
  const cells: ReactNode[] = [];
  for (let row = firstRow; row <= lastRow; row++) {
    if (hiddenRows.has(row)) continue;
    const top = rows.start(row);
    const selected = row >= range.top && row <= range.bottom;
    gridLines.push(
      <div key={`row-${row}`} className={styles.rowLine} style={{ top: top + ROW_HEIGHT - 1 }} />,
    );
    rowHeaders.push(
      <div
        key={row}
        role="rowheader"
        aria-rowindex={row + 2}
        className={`${styles.rowHeader} ${selected ? styles.headerSelected : ''}`}
        style={{ top, height: ROW_HEIGHT }}
        onPointerDown={startRowSelect}
      >
        {row + 1}
      </div>,
    );
    for (let column = firstColumn; column <= lastColumn; column++) {
      const cell = sheet.cells[cellKey(row, column)];
      const { filter } = sheet;
      const filterButton =
        !!filter && row === filter.top && column >= filter.left && column <= filter.right;
      if (!cell && !filterButton) continue;
      const result = engine.result(sheet, row, column);
      cells.push(
        <CellView
          key={cellKey(row, column)}
          name={cellName(row, column)}
          row={row}
          column={column}
          text={displayText(result, cell?.style?.format)}
          isError={result.isError}
          left={columns.start(column)}
          top={top}
          width={columns.size(column)}
          height={ROW_HEIGHT}
          align={cell?.style?.align ?? defaultAlignment(result)}
          style={cell?.style}
          filterButton={filterButton}
          onOpenFilter={onOpenFilter}
        />,
      );
    }
  }

  return (
    <div
      ref={scrollerRef}
      className={styles.scroller}
      role="grid"
      aria-label={`${sheet.name} cells`}
      aria-rowcount={MAX_ROWS + 1}
      aria-colcount={MAX_COLUMNS + 1}
      aria-activedescendant={undefined}
      data-version={version}
      tabIndex={0}
      onScroll={(event) => {
        const { scrollLeft, scrollTop, clientWidth, clientHeight } = event.currentTarget;
        setScroll({ left: scrollLeft, top: scrollTop, width: clientWidth, height: clientHeight });
      }}
      onKeyDown={onGridKeyDown}
      onCopy={onCopy}
      onCut={onCut}
      onPaste={onPaste}
    >
      <div
        className={styles.canvas}
        style={{
          width: HEADER_WIDTH + columns.total,
          height: HEADER_HEIGHT + rows.total,
        }}
      >
        <div className={styles.columnHeaders}>
          <div className={styles.corner} />
          {columnHeaders}
        </div>
        <div className={styles.rowHeaders} style={{ height: rows.total }}>
          {rowHeaders}
        </div>
        <div
          className={styles.cells}
          style={{ width: columns.total, height: rows.total }}
          onPointerDown={startCellDrag}
        >
          {gridLines}
          {cells}
          <div className={styles.selection} style={selectedBox} />
          <div className={styles.focusCell} style={focusBox} />
          {edit?.source === 'cell' && (
            <input
              ref={editorRef}
              className={styles.editor}
              aria-label={`Editing ${cellName(edit.row, edit.column)}`}
              spellCheck={false}
              style={{
                left: columns.start(edit.column),
                top: rows.start(edit.row),
                minWidth: columns.size(edit.column),
                height: ROW_HEIGHT,
              }}
              value={edit.value}
              onChange={(event) => onEditChange(event.target.value)}
              onKeyDown={onEditKeyDown}
              onPointerDown={(event) => event.stopPropagation()}
            />
          )}
          {overlay}
        </div>
      </div>
    </div>
  );
}
