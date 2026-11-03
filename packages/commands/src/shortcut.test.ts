import { describe, expect, it } from 'vitest';
import { formatShortcut, matchesShortcut, parseShortcut } from './shortcut';

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('parseShortcut', () => {
  it('parses modifiers in any order', () => {
    expect(parseShortcut('Shift+Mod+K')).toEqual({
      key: 'k',
      mod: true,
      ctrl: false,
      meta: false,
      shift: true,
      alt: false,
    });
  });

  it('supports "+" as the key', () => {
    expect(parseShortcut('Mod++').key).toBe('+');
  });

  it('rejects malformed shortcuts', () => {
    expect(() => parseShortcut('Mod+Shift')).toThrow(/no key/);
    expect(() => parseShortcut('A+B')).toThrow(/more than one key/);
  });
});

describe('matchesShortcut', () => {
  const modK = parseShortcut('Mod+K');

  it('maps Mod to Ctrl on Windows/Linux and Cmd on macOS', () => {
    expect(matchesShortcut(key({ key: 'k', ctrlKey: true }), modK, false)).toBe(true);
    expect(matchesShortcut(key({ key: 'k', metaKey: true }), modK, false)).toBe(false);
    expect(matchesShortcut(key({ key: 'k', metaKey: true }), modK, true)).toBe(true);
  });

  it('requires exact modifiers', () => {
    expect(matchesShortcut(key({ key: 'K', ctrlKey: true, shiftKey: true }), modK, false)).toBe(
      false,
    );
    const shifted = parseShortcut('Mod+Shift+Z');
    expect(matchesShortcut(key({ key: 'Z', ctrlKey: true, shiftKey: true }), shifted, false)).toBe(
      true,
    );
  });

  it('falls back to the physical key code', () => {
    const altN = parseShortcut('Alt+N');
    expect(matchesShortcut(key({ key: '˜', code: 'KeyN', altKey: true }), altN, true)).toBe(true);
  });
});

describe('formatShortcut', () => {
  it('formats for Windows/Linux', () => {
    expect(formatShortcut('Mod+Shift+K', false)).toBe('Ctrl+Shift+K');
    expect(formatShortcut('Alt+ArrowLeft', false)).toBe('Alt+←');
    expect(formatShortcut('F2', false)).toBe('F2');
  });

  it('formats for macOS with symbols', () => {
    expect(formatShortcut('Mod+Shift+K', true)).toBe('⇧⌘K');
  });
});
