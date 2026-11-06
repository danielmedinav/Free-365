import { Extension } from '@tiptap/core';
import { CellSelection, isInTable, selectionCell } from '@tiptap/pm/tables';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableFormat: {
      setCellColor: (color: string | null) => ReturnType;
    };
  }
}

/** Adds a background color to table cells. */
export const TableFormat = Extension.create({
  name: 'tableFormat',

  addGlobalAttributes() {
    return [
      {
        types: ['tableCell', 'tableHeader'],
        attributes: {
          backgroundColor: {
            default: null,
            parseHTML: (element) => element.style.backgroundColor || null,
            renderHTML: (attributes: Record<string, unknown>) =>
              attributes.backgroundColor
                ? { style: `background-color: ${String(attributes.backgroundColor)}` }
                : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      // The table library's own command skips everything if the first cell already has the value.
      setCellColor:
        (color) =>
        ({ state, tr, dispatch }) => {
          if (!isInTable(state)) return false;
          if (dispatch) {
            if (state.selection instanceof CellSelection) {
              state.selection.forEachCell((_cell, pos) => {
                tr.setNodeAttribute(pos, 'backgroundColor', color);
              });
            } else {
              tr.setNodeAttribute(selectionCell(state).pos, 'backgroundColor', color);
            }
          }
          return true;
        },
    };
  },
});

const PX_TO_TWIPS = 15;

type TableColumnCell = { colspan: number; colwidth: (number | null)[] | null };

/**
 * Column widths in twips for a table's first row. Columns someone resized keep their width, the rest
 * share what's left, and the whole table is scaled down if it wouldn't fit between the margins.
 */
export function tableColumnWidths(firstRow: TableColumnCell[], available: number): number[] {
  const columns = firstRow.flatMap((cell) =>
    Array.from({ length: cell.colspan }, (_, index): number | null => {
      const width = cell.colwidth?.[index];
      return width ? width * PX_TO_TWIPS : null;
    }),
  );
  const fixed = columns.reduce<number>((total, width) => total + (width ?? 0), 0);
  const free = columns.filter((width) => width === null).length;
  const share = free ? Math.max(available - fixed, free * PX_TO_TWIPS) / free : 0;
  const widths = columns.map((width) => width ?? share);
  const total = widths.reduce((sum, width) => sum + width, 0);
  const scale = total > available ? available / total : 1;
  return widths.map((width) => Math.floor(width * scale));
}
