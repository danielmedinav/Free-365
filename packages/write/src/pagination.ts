/**
 * Works out where pages end. The document stays one flow of text; spacers are added at these points
 * to push what follows to the next sheet. Everything here is in pixels of the unbroken flow.
 */
export type PageNote = {
  /** Where its reference mark sits in the flow. */
  top: number;
  height: number;
};

export type PageUnit = {
  top: number;
  bottom: number;
  /** Where a spacer goes to start this unit on a new page. */
  positions: number[];
  /** Comes right after a manual page break. */
  forceBreakBefore?: boolean;
  /** Footnotes referenced from this unit. Each is printed at the bottom of its reference's page. */
  notes?: PageNote[];
  /** For text: the first line that ends past `limit`, if the unit can be split between lines. */
  splitAt?: (limit: number) => { pos: number; top: number } | undefined;
};

export type ComputedBreak = {
  positions: number[];
  /** Unused room left at the bottom of the page this break ends. */
  blank: number;
};

const sumHeights = (notes: PageNote[]) => notes.reduce((total, note) => total + note.height, 0);

/** `noteAreaPadding` is the extra room a page needs once it has any footnotes, for the rule above them. */
export function computeBreaks(
  units: PageUnit[],
  pageHeight: number,
  noteAreaPadding = 0,
): ComputedBreak[] {
  const breaks: ComputedBreak[] = [];
  let pageStart = units[0]?.top ?? 0;
  /** Height of the footnotes already placed on this page. */
  let placedNotes = 0;

  const startPageAt = (positions: number[], top: number) => {
    breaks.push({ positions, blank: pageStart + pageHeight - top });
    pageStart = top;
    placedNotes = 0;
  };

  const textLimit = (noteHeight: number) =>
    pageStart + pageHeight - (noteHeight > 0 ? noteHeight + noteAreaPadding : 0);

  for (const unit of units) {
    if (unit.forceBreakBefore) startPageAt(unit.positions, unit.top);
    let notes = unit.notes ?? [];

    /**
     * Where text must stop on this page. A note only takes room if its reference stays on the page,
     * and the room it takes can push its reference off, so this settles over a couple of passes.
     */
    const limit = () => {
      let result = textLimit(placedNotes);
      for (let pass = 0; pass < 2; pass++) {
        const staying = notes.filter((note) => note.top < result);
        result = textLimit(placedNotes + sumHeights(staying));
      }
      return result;
    };

    // Repeats because a very long paragraph can cover several pages.
    while (unit.bottom > limit()) {
      const line = unit.splitAt?.(limit());
      if (line && line.top > pageStart && line.top > unit.top) {
        startPageAt([line.pos], line.top);
        notes = notes.filter((note) => note.top >= line.top);
      } else if (unit.top > pageStart) {
        startPageAt(unit.positions, unit.top);
      } else {
        break; // Taller than a whole page and can't be split, so it has to overflow.
      }
    }
    placedNotes += sumHeights(notes);
  }
  return breaks;
}
