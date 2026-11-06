import { describe, expect, it } from 'vitest';
import { computeBreaks, type PageUnit } from './pagination';

/** Stacks units of the given heights, using each one's index as its position. */
function stack(...heights: number[]): PageUnit[] {
  let top = 0;
  return heights.map((height, index) => {
    const unit: PageUnit = { top, bottom: top + height, positions: [index] };
    top += height;
    return unit;
  });
}

/** Adds evenly spaced lines to a unit, as a paragraph would have. */
function withLines(unit: PageUnit, lineHeight: number, startPos: number): PageUnit {
  return {
    ...unit,
    splitAt: (limit) => {
      for (let top = unit.top, i = 0; top < unit.bottom; top += lineHeight, i++) {
        if (top + lineHeight > limit) return { pos: startPos + i, top };
      }
      return undefined;
    },
  };
}

describe('computeBreaks', () => {
  it('adds no breaks when everything fits, even exactly', () => {
    expect(computeBreaks([], 100)).toEqual([]);
    expect(computeBreaks(stack(50, 50), 100)).toEqual([]);
  });

  it('moves a block that does not fit to the next page', () => {
    expect(computeBreaks(stack(60, 60), 100)).toEqual([{ positions: [1], blank: 40 }]);
  });

  it('measures each page from where it started', () => {
    const breaks = computeBreaks(stack(60, 60, 60, 60), 100);
    expect(breaks.map((b) => b.positions)).toEqual([[1], [2], [3]]);
  });

  it('splits text between lines, filling the page', () => {
    const units = stack(70, 60);
    units[1] = withLines(units[1]!, 20, 500);
    // The second block starts at 70, so one 20px line fits before the page ends at 100.
    expect(computeBreaks(units, 100)).toEqual([{ positions: [501], blank: 10 }]);
  });

  it('moves the whole paragraph when not even its first line fits', () => {
    const units = stack(95, 60);
    units[1] = withLines(units[1]!, 20, 500);
    expect(computeBreaks(units, 100)).toEqual([{ positions: [1], blank: 5 }]);
  });

  it('splits one paragraph across several pages', () => {
    const units = [withLines({ top: 0, bottom: 250, positions: [0] }, 25, 10)];
    expect(computeBreaks(units, 100).map((b) => b.positions)).toEqual([[14], [18]]);
  });

  it('honors manual page breaks, leaving the rest of the page blank', () => {
    const units = stack(30, 30);
    units[1]!.forceBreakBefore = true;
    expect(computeBreaks(units, 100)).toEqual([{ positions: [1], blank: 70 }]);
  });

  it('counts the next page from a manual break', () => {
    const units = stack(30, 90, 20);
    units[1]!.forceBreakBefore = true;
    expect(computeBreaks(units, 100).map((b) => b.positions)).toEqual([[1], [2]]);
  });

  it('allows a blank page from two manual breaks in a row', () => {
    const units = stack(10, 5, 10);
    units[1]!.forceBreakBefore = true;
    units[2]!.forceBreakBefore = true;
    expect(computeBreaks(units, 100)).toHaveLength(2);
  });

  it('lets something taller than a page overflow instead of looping forever', () => {
    expect(computeBreaks(stack(500), 100)).toEqual([]);
    expect(computeBreaks(stack(10, 500, 10), 100).map((b) => b.positions)).toEqual([[1], [2]]);
  });
});
