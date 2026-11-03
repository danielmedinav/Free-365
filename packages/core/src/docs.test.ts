import { describe, expect, it } from 'vitest';
import { docPath, isDocKind, newDocId, normalizeTitle } from './docs';
import { formatRelativeTime } from './time';

describe('docs helpers', () => {
  it('recognizes doc kinds', () => {
    expect(isDocKind('write')).toBe(true);
    expect(isDocKind('grid')).toBe(true);
    expect(isDocKind('deck')).toBe(true);
    expect(isDocKind('slides')).toBe(false);
    expect(isDocKind(3)).toBe(false);
  });

  it('builds routes per app', () => {
    expect(docPath({ id: 'abc', kind: 'grid' })).toBe('/grid/abc');
  });

  it('generates unique ids', () => {
    expect(newDocId()).not.toBe(newDocId());
  });

  it('normalizes titles and falls back to defaults', () => {
    expect(normalizeTitle('  Q3   budget ', 'grid')).toBe('Q3 budget');
    expect(normalizeTitle('   ', 'deck')).toBe('Untitled presentation');
    expect(normalizeTitle('x'.repeat(300), 'write')).toHaveLength(200);
  });
});

describe('formatRelativeTime', () => {
  const now = new Date(2026, 5, 15, 12, 0).getTime();

  it('formats recent times', () => {
    expect(formatRelativeTime(now - 10_000, now)).toBe('Just now');
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(formatRelativeTime(now - 30 * 3_600_000, now)).toBe('Yesterday');
  });

  it('includes the year only for other years', () => {
    expect(formatRelativeTime(new Date(2026, 0, 2).getTime(), now)).not.toMatch(/2026/);
    expect(formatRelativeTime(new Date(2024, 0, 2).getTime(), now)).toMatch(/2024/);
  });
});
