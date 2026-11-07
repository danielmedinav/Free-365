import { Extension } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { readPageSetup, PX_PER_INCH } from './pageSetup';
import { computeBreaks, type PageNote, type PageUnit } from './pagination';

/** Spacer height in pixels, not counting the on-screen gap between sheets. */
type PageGap = { positions: number[]; height: number };

type PaginationState = { gaps: PageGap[]; decorations: DecorationSet };

export const paginationKey = new PluginKey<PaginationState>('fsPagination');

const MEASURING_CLASS = 'fs-measuring';
/** Room for the rule above a page's footnotes; matches the footnote area's styles. */
const NOTE_AREA_PADDING = 14;

/** Which page a document position is on, counting from 1. */
export function pageOfPosition(gaps: { positions: number[] }[], pos: number): number {
  return gaps.filter((gap) => (gap.positions[0] ?? 0) <= pos).length + 1;
}

function createSpacer(height: number, betweenRows: boolean): HTMLElement {
  // The sheet gap is a CSS variable because it disappears when printing.
  const cssHeight = `calc(${height}px + var(--fs-sheet-gap))`;
  const spacer = document.createElement('span');
  spacer.className = 'fs-page-gap';
  spacer.contentEditable = 'false';
  spacer.ariaHidden = 'true';
  spacer.style.height = cssHeight;

  // Inside a table it has to be a row of its own. With no borders, nothing crosses the gap.
  if (betweenRows) {
    spacer.classList.add('fs-page-gap-row');
    const cell = document.createElement('span');
    cell.className = 'fs-page-gap-cell';
    cell.style.height = cssHeight;
    spacer.append(cell);
  }
  return spacer;
}

function decorate(doc: PmNode, gaps: PageGap[]): DecorationSet {
  return DecorationSet.create(
    doc,
    gaps.flatMap(({ positions, height }) =>
      positions.map((pos) => {
        const betweenRows = doc.resolve(pos).parent.type.name === 'table';
        // A negative side keeps the cursor after the spacer, on the new page.
        return Decoration.widget(pos, () => createSpacer(height, betweenRows), {
          side: -1,
          key: `gap-${height}-${betweenRows}`,
          ignoreSelection: true,
        });
      }),
    ),
  );
}

function firstLineSplit(view: EditorView, start: number, end: number) {
  return (limit: number) => {
    const bottomAt = (pos: number) => view.coordsAtPos(pos, 1).bottom;
    if (end <= start || bottomAt(end) <= limit) return undefined;
    let low = start;
    let high = end;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (bottomAt(middle) > limit) high = middle;
      else low = middle + 1;
    }
    return { pos: low, top: view.coordsAtPos(low, 1).top };
  };
}

/** Measures footnote text as the footnote area will show it, by rendering it off-screen. */
function createNoteMeasurer(view: EditorView, widthPx: number) {
  const heights = new Map<string, number>();
  let element: HTMLElement | undefined;

  return {
    heightOf(text: string): number {
      const known = heights.get(text);
      if (known !== undefined) return known;
      if (!element) {
        element = document.createElement('div');
        element.className = 'fs-footnote-line';
        element.style.cssText = `position:absolute;visibility:hidden;width:${widthPx}px`;
        view.dom.parentElement?.append(element);
      }
      element.textContent = `00. ${text}`;
      const height = element.getBoundingClientRect().height;
      heights.set(text, height);
      return height;
    },
    remove: () => element?.remove(),
  };
}

function collectUnits(view: EditorView, noteHeight: (text: string) => number): PageUnit[] {
  const units: PageUnit[] = [];
  let afterManualBreak = false;

  const notesIn = (node: PmNode, pos: number): PageNote[] => {
    const notes: PageNote[] = [];
    node.descendants((child, offset) => {
      if (child.type.name === 'footnote') {
        const { top } = view.coordsAtPos(pos + 1 + offset, 1);
        notes.push({ top, height: noteHeight(String(child.attrs.text ?? '')) });
      }
    });
    return notes;
  };

  const add = (node: PmNode, pos: number, positions: number[], splitAt?: PageUnit['splitAt']) => {
    const element = view.nodeDOM(pos);
    if (!(element instanceof HTMLElement)) return;
    const { top, bottom } = element.getBoundingClientRect();
    units.push({
      top,
      bottom,
      positions,
      splitAt,
      forceBreakBefore: afterManualBreak,
      notes: notesIn(node, pos),
    });
    afterManualBreak = false;
  };

  view.state.doc.descendants((node, pos, parent, index) => {
    // Kept whole: a row can't split, and text in columns has no single top-to-bottom order.
    if (node.type.name === 'tableRow' || node.type.name === 'columnSection') {
      add(node, pos, [pos]);
      return false;
    }
    if (node.isTextblock) {
      // Ahead of a list item rather than inside it, so its bullet moves to the new page too.
      const firstInItem = parent?.type.name === 'listItem' && index === 0;
      const start = pos + 1;
      const end = pos + node.nodeSize - 1;
      add(node, pos, [firstInItem ? pos - 1 : start], firstLineSplit(view, start, end));
      return false;
    }
    if (node.isBlock && node.isLeaf) {
      add(node, pos, [pos]);
      if (node.type.name === 'pageBreak') afterManualBreak = true;
    }
    return true;
  });
  return units;
}

function measure(view: EditorView): PageGap[] {
  const setup = readPageSetup(view.state.doc.attrs.pageSetup);
  const marginsPx = (setup.marginTopIn + setup.marginBottomIn) * PX_PER_INCH;
  const pageHeight = setup.heightIn * PX_PER_INCH - marginsPx;
  const contentWidth = (setup.widthIn - setup.marginLeftIn - setup.marginRightIn) * PX_PER_INCH;

  // Measure the text as if there were no spacers. The class sits outside the editable area, so
  // ProseMirror doesn't see a change, and the browser paints nothing until this is done.
  const host = view.dom.parentElement;
  host?.classList.add(MEASURING_CLASS);
  const measurer = createNoteMeasurer(view, contentWidth);
  const units = collectUnits(view, measurer.heightOf);
  const breaks = computeBreaks(units, pageHeight, NOTE_AREA_PADDING);
  measurer.remove();
  host?.classList.remove(MEASURING_CLASS);

  return breaks.map(({ positions, blank }) => ({
    positions,
    height: Math.round((blank + marginsPx) * 100) / 100,
  }));
}

function sameGaps(a: PageGap[], b: PageGap[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Lays out the open document in pages. Editor-only: nothing here is saved. */
export const Pagination = Extension.create({
  name: 'pagination',

  addProseMirrorPlugins() {
    return [
      new Plugin<PaginationState>({
        key: paginationKey,
        state: {
          init: () => ({ gaps: [], decorations: DecorationSet.empty }),
          apply(tr, previous) {
            const gaps = tr.getMeta(paginationKey) as PageGap[] | undefined;
            if (gaps) return { gaps, decorations: decorate(tr.doc, gaps) };
            if (!tr.docChanged) return previous;
            return {
              gaps: previous.gaps.map((gap) => ({
                ...gap,
                positions: gap.positions.map((pos) => tr.mapping.map(pos)),
              })),
              decorations: previous.decorations.map(tr.mapping, tr.doc),
            };
          },
        },
        props: {
          decorations: (state) => paginationKey.getState(state)?.decorations,
        },
        view(view) {
          let frame = 0;

          const run = () => {
            frame = 0;
            // Redrawing around text being composed (e.g. accented input) would interrupt it.
            if (view.isDestroyed || view.composing) return;
            const gaps = measure(view);
            const current = paginationKey.getState(view.state)?.gaps ?? [];
            if (!sameGaps(gaps, current)) {
              view.dispatch(
                view.state.tr.setMeta(paginationKey, gaps).setMeta('addToHistory', false),
              );
            }
          };

          // An animation frame runs before the next paint, so pages never visibly jump.
          const schedule = () => {
            if (!frame) frame = requestAnimationFrame(run);
          };

          // Images and fonts change the text's height once they finish loading.
          view.dom.addEventListener('load', schedule, true);
          view.dom.addEventListener('compositionend', schedule);
          void document.fonts?.ready.then(schedule);
          schedule();

          return {
            update(updated, previous) {
              if (updated.state.doc !== previous.doc) schedule();
            },
            destroy() {
              cancelAnimationFrame(frame);
              view.dom.removeEventListener('load', schedule, true);
              view.dom.removeEventListener('compositionend', schedule);
            },
          };
        },
      }),
    ];
  },
});
