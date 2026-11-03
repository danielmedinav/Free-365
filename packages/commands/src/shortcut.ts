/**
 * Shortcut strings look like `Mod+Shift+K`, `Alt+ArrowLeft`, `F2`, or `Mod+/`.
 * `Mod` means Cmd on macOS and Ctrl elsewhere. Modifier order does not matter.
 */
export type ParsedShortcut = {
  key: string;
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
};

type KeyEventLike = Pick<
  KeyboardEvent,
  'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'
>;

const MODIFIERS = new Set(['mod', 'ctrl', 'control', 'meta', 'cmd', 'shift', 'alt', 'option']);

export function parseShortcut(shortcut: string): ParsedShortcut {
  // Allow "+" itself as the key, e.g. "Mod++".
  const parts = shortcut.endsWith('++')
    ? [...shortcut.slice(0, -2).split('+'), '+']
    : shortcut.split('+');
  const result: ParsedShortcut = {
    key: '',
    mod: false,
    ctrl: false,
    meta: false,
    shift: false,
    alt: false,
  };
  for (const raw of parts) {
    const part = raw.trim().toLowerCase();
    if (!part) throw new Error(`Invalid shortcut: "${shortcut}"`);
    if (MODIFIERS.has(part)) {
      if (part === 'mod') result.mod = true;
      else if (part === 'ctrl' || part === 'control') result.ctrl = true;
      else if (part === 'meta' || part === 'cmd') result.meta = true;
      else if (part === 'shift') result.shift = true;
      else result.alt = true;
    } else if (result.key) {
      throw new Error(`Shortcut has more than one key: "${shortcut}"`);
    } else {
      result.key = part;
    }
  }
  if (!result.key) throw new Error(`Shortcut has no key: "${shortcut}"`);
  return result;
}

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? navigator.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** Matches by `key`, falling back to the physical `code` for letters/digits (e.g. Alt on macOS). */
export function matchesShortcut(
  event: KeyEventLike,
  shortcut: ParsedShortcut,
  isMac: boolean,
): boolean {
  const wantCtrl = shortcut.ctrl || (shortcut.mod && !isMac);
  const wantMeta = shortcut.meta || (shortcut.mod && isMac);
  if (event.ctrlKey !== wantCtrl || event.metaKey !== wantMeta) return false;
  if (event.altKey !== shortcut.alt || event.shiftKey !== shortcut.shift) return false;

  const key = event.key.toLowerCase();
  if (key === shortcut.key) return true;
  if (/^[a-z]$/.test(shortcut.key)) return event.code === `Key${shortcut.key.toUpperCase()}`;
  if (/^[0-9]$/.test(shortcut.key)) return event.code === `Digit${shortcut.key}`;
  return false;
}

const KEY_LABELS: Record<string, string> = {
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  arrowdown: '↓',
  escape: 'Esc',
  delete: 'Del',
  ' ': 'Space',
  space: 'Space',
};

/** Human-readable label: `Ctrl+Shift+K` on Windows/Linux, `⇧⌘K` on macOS. */
export function formatShortcut(shortcut: string, isMac: boolean = isMacPlatform()): string {
  const s = parseShortcut(shortcut);
  const key = KEY_LABELS[s.key] ?? (s.key.length === 1 ? s.key.toUpperCase() : capitalize(s.key));
  if (isMac) {
    return [
      s.ctrl ? '⌃' : '',
      s.alt ? '⌥' : '',
      s.shift ? '⇧' : '',
      s.mod || s.meta ? '⌘' : '',
      key,
    ].join('');
  }
  return [
    s.mod || s.ctrl ? 'Ctrl' : '',
    s.meta ? 'Win' : '',
    s.alt ? 'Alt' : '',
    s.shift ? 'Shift' : '',
    key,
  ]
    .filter(Boolean)
    .join('+');
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
