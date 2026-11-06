export const FONT_FAMILIES = [
  'Arial',
  'Courier New',
  'Georgia',
  'Tahoma',
  'Times New Roman',
  'Verdana',
];

/** In points. */
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];

export const LINE_SPACINGS = [1, 1.15, 1.5, 2, 2.5, 3];

export type NamedColor = { name: string; hex: string };

export const TEXT_COLORS: NamedColor[] = [
  { name: 'Black', hex: '#000000' },
  { name: 'Gray', hex: '#666666' },
  { name: 'Red', hex: '#c62828' },
  { name: 'Orange', hex: '#ef6c00' },
  { name: 'Gold', hex: '#b28704' },
  { name: 'Green', hex: '#2e7d32' },
  { name: 'Teal', hex: '#00796b' },
  { name: 'Blue', hex: '#1565c0' },
  { name: 'Indigo', hex: '#3949ab' },
  { name: 'Purple', hex: '#7b1fa2' },
  { name: 'Pink', hex: '#c2185b' },
  { name: 'Brown', hex: '#5d4037' },
];

export const HIGHLIGHT_COLORS: NamedColor[] = [
  { name: 'Yellow', hex: '#fff176' },
  { name: 'Lime', hex: '#ccff90' },
  { name: 'Green', hex: '#a5d6a7' },
  { name: 'Aqua', hex: '#80deea' },
  { name: 'Blue', hex: '#90caf9' },
  { name: 'Lavender', hex: '#ce93d8' },
  { name: 'Pink', hex: '#f48fb1' },
  { name: 'Orange', hex: '#ffcc80' },
  { name: 'Gray', hex: '#d9d9d9' },
];

export const MAX_INDENT = 8;
/** Inches per indent level. */
export const INDENT_STEP_INCHES = 0.5;

/** Safe to use in a command id: `Times New Roman` -> `times-new-roman`. */
export function slug(value: string | number): string {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

/** The first family in a CSS font list, without quotes. */
export function primaryFont(fontFamily: unknown): string | undefined {
  if (typeof fontFamily !== 'string') return undefined;
  const first = fontFamily.split(',')[0]?.replace(/['"]/g, '').trim();
  return first || undefined;
}

/** Reads `#abc`, `#aabbcc`, or `rgb(1, 2, 3)` as lowercase `#aabbcc`. */
export function toHexColor(color: unknown): string | undefined {
  if (typeof color !== 'string') return undefined;
  const value = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  if (/^#[0-9a-f]{3}$/.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(value);
  if (!rgb) return undefined;
  const channels = [rgb[1], rgb[2], rgb[3]].map((c) =>
    Math.min(Number(c), 255).toString(16).padStart(2, '0'),
  );
  return `#${channels.join('')}`;
}

/** Reads a CSS size in `pt` or `px` as points. */
export function toPoints(size: unknown): number | undefined {
  if (typeof size !== 'string') return undefined;
  const match = /^([\d.]+)(pt|px)$/.exec(size.trim().toLowerCase());
  if (!match) return undefined;
  const value = Number(match[1]);
  return match[2] === 'px' ? value * 0.75 : value;
}

const ALLOWED_LINK_SCHEMES = ['http', 'https', 'mailto', 'tel'];

/** Turns what someone typed into a link target, or undefined if it isn't safe to link to. */
export function normalizeLink(input: string): string | undefined {
  const value = input.trim();
  if (!value || /\s/.test(value)) return undefined;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1]?.toLowerCase();
  if (scheme) return ALLOWED_LINK_SCHEMES.includes(scheme) ? value : undefined;
  if (/^[^/@]+@[^/@]+\.[^/@]+$/.test(value)) return `mailto:${value}`;
  return `https://${value}`;
}
