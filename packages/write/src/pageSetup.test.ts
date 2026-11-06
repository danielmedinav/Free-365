import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SETUP,
  isLandscape,
  matchesMargins,
  matchesPageSize,
  PAGE_SIZES,
  readPageSetup,
  withOrientation,
  withPageSize,
} from './pageSetup';

describe('readPageSetup', () => {
  it('falls back to defaults for missing or invalid values', () => {
    expect(readPageSetup(undefined)).toEqual(DEFAULT_PAGE_SETUP);
    expect(readPageSetup('nonsense')).toEqual(DEFAULT_PAGE_SETUP);
    expect(readPageSetup({ widthIn: 'wide', headerText: 7, pageNumbers: 'side' })).toEqual(
      DEFAULT_PAGE_SETUP,
    );
    expect(readPageSetup({ marginTopIn: Number.NaN })).toEqual(DEFAULT_PAGE_SETUP);
  });

  it('keeps valid values', () => {
    const setup = readPageSetup({ marginLeftIn: 2, headerText: 'Hi', pageNumbers: 'footer' });
    expect(setup.marginLeftIn).toBe(2);
    expect(setup.headerText).toBe('Hi');
    expect(setup.pageNumbers).toBe('footer');
  });

  it('keeps page sizes within sensible limits', () => {
    expect(readPageSetup({ widthIn: 0 }).widthIn).toBe(3);
    expect(readPageSetup({ heightIn: 1000 }).heightIn).toBe(22);
  });

  it('never lets margins swallow the page', () => {
    const setup = readPageSetup({ marginLeftIn: 8, marginRightIn: 8, marginTopIn: -2 });
    expect(setup.widthIn - setup.marginLeftIn - setup.marginRightIn).toBeCloseTo(1);
    expect(setup.marginLeftIn).toBeCloseTo(setup.marginRightIn);
    expect(setup.marginTopIn).toBe(0);
  });
});

describe('orientation and size', () => {
  const a4 = PAGE_SIZES[1]!;

  it('swaps dimensions, and is safe to repeat', () => {
    const landscape = { ...DEFAULT_PAGE_SETUP, ...withOrientation(DEFAULT_PAGE_SETUP, true) };
    expect(landscape.widthIn).toBe(11);
    expect(landscape.heightIn).toBe(8.5);
    expect(isLandscape(landscape)).toBe(true);
    expect(withOrientation(landscape, true)).toEqual({ widthIn: 11, heightIn: 8.5 });
    expect(withOrientation(landscape, false)).toEqual({ widthIn: 8.5, heightIn: 11 });
  });

  it('keeps the orientation when the paper size changes', () => {
    const landscape = { ...DEFAULT_PAGE_SETUP, widthIn: 11, heightIn: 8.5 };
    expect(withPageSize(landscape, a4)).toEqual({ widthIn: 11.69, heightIn: 8.27 });
    expect(withPageSize(DEFAULT_PAGE_SETUP, a4)).toEqual({ widthIn: 8.27, heightIn: 11.69 });
  });

  it('recognizes a paper size in either orientation, within rounding', () => {
    expect(matchesPageSize(DEFAULT_PAGE_SETUP, PAGE_SIZES[0]!)).toBe(true);
    expect(
      matchesPageSize({ ...DEFAULT_PAGE_SETUP, widthIn: 11, heightIn: 8.5 }, PAGE_SIZES[0]!),
    ).toBe(true);
    expect(matchesPageSize({ ...DEFAULT_PAGE_SETUP, widthIn: 8.268, heightIn: 11.693 }, a4)).toBe(
      true,
    );
    expect(matchesPageSize(DEFAULT_PAGE_SETUP, a4)).toBe(false);
  });

  it('recognizes margin presets', () => {
    expect(matchesMargins(DEFAULT_PAGE_SETUP, { top: 1, bottom: 1, left: 1, right: 1 })).toBe(true);
    expect(matchesMargins(DEFAULT_PAGE_SETUP, { top: 1, bottom: 1, left: 2, right: 2 })).toBe(
      false,
    );
  });
});
