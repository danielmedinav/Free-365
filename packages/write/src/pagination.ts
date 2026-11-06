/**
 * Works out where pages end. The document stays one flow of text; spacers are added at these points
 * to push what follows to the next sheet. Everything here is in pixels of the unbroken flow.
 */
export type PageUnit = {
  top: number;
  bottom: number;
  /** Where a spacer goes to start this unit on a new page. */
  positions: number[];
  /** Comes right after a manual page break. */
  forceBreakBefore?: boolean;
  /** For text: the first line that ends past `limit`, if the unit can be split between lines. */
  splitAt?: (limit: number) => { pos: number; top: number } | undefined;
};

export type ComputedBreak = {
  positions: number[];
  /** Unused room left at the bottom of the page this break ends. */
  blank: number;
};

export function computeBreaks(units: PageUnit[], pageHeight: number): ComputedBreak[] {
  const breaks: ComputedBreak[] = [];
  let pageStart = units[0]?.top ?? 0;

  const startPageAt = (positions: number[], top: number) => {
    breaks.push({ positions, blank: pageStart + pageHeight - top });
    pageStart = top;
  };

  for (const unit of units) {
    if (unit.forceBreakBefore) startPageAt(unit.positions, unit.top);

    // Repeats because a very long paragraph can cover several pages.
    while (unit.bottom - pageStart > pageHeight) {
      const line = unit.splitAt?.(pageStart + pageHeight);
      if (line && line.top > pageStart && line.top > unit.top) {
        startPageAt([line.pos], line.top);
      } else if (unit.top > pageStart) {
        startPageAt(unit.positions, unit.top);
      } else {
        break; // Taller than a whole page and can't be split, so it has to overflow.
      }
    }
  }
  return breaks;
}
